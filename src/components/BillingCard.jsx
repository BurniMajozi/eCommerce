import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { fetchBilling, issueInvoice, chargeInvoice, verifyInvoice, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { SearchExportBar, matchQuery } from './TableToolbar';
import { downloadCsv, dateStamp } from '../utils/exportCsv';
import { Wallet, RefreshCw, Loader2, CreditCard, CheckCircle2, FileText } from 'lucide-react';

const rand = (n) => `R ${Number(n || 0).toLocaleString('en-ZA')}`;

// Platform-owner subscription billing: live metered charge per tenant → issue a
// monthly invoice → charge it via Paystack → verify payment.
export const BillingCard = () => {
  const { auth, tenantAccess, triggerNotification } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [emailById, setEmailById] = useState({});

  useEffect(() => {
    if (!live) { setData(null); return; }
    let active = true;
    setLoading(true);
    fetchBilling(scope).then((r) => { if (active) setData(r); }).catch(() => { if (active) setData(null); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, scope.accessToken, scope.tenantId, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const issue = async (t) => {
    setBusyId(t.id);
    try { await issueInvoice(t.id, null, scope); triggerNotification('Invoice issued', `${t.name} · ${data.period}.`, 'success'); reload(); }
    catch (e) { triggerNotification('Could not issue', e?.message || 'Failed.', 'danger'); }
    finally { setBusyId(null); }
  };

  const charge = async (t, inv) => {
    const email = (emailById[inv.id] || inv.payerEmail || '').trim();
    if (!email) { triggerNotification('Email needed', 'Enter the tenant billing email to charge.', 'warning'); return; }
    setBusyId(inv.id);
    try {
      const r = await chargeInvoice(inv.id, email, scope);
      if (r?.paid) { triggerNotification('Marked paid', 'Nothing to charge (free plan).', 'success'); reload(); }
      else if (r?.needsPaymentSetup) triggerNotification('Paystack not set up', 'Set PAYSTACK_SECRET_KEY to take card payment.', 'info');
      else if (r?.authorizationUrl) { window.open(r.authorizationUrl, '_blank', 'noopener'); triggerNotification('Payment link opened', 'After the tenant pays, click Verify.', 'info'); }
      else triggerNotification('Charge started', 'Awaiting payment.', 'info');
    } catch (e) { triggerNotification('Charge failed', e?.message || 'Failed.', 'danger'); }
    finally { setBusyId(null); }
  };

  const verify = async (inv) => {
    setBusyId(inv.id);
    try {
      const r = await verifyInvoice(inv.id, null, scope);
      if (r?.paid) { triggerNotification('Payment confirmed', `${inv.tenantName} · ${rand(inv.total)}.`, 'success'); reload(); }
      else triggerNotification('Not paid yet', `Paystack status: ${r?.paystackStatus || 'pending'}.`, 'warning');
    } catch (e) { triggerNotification('Verify failed', e?.message || 'Failed.', 'danger'); }
    finally { setBusyId(null); }
  };

  const [search, setSearch] = useState('');
  const shownTenants = (data?.tenants ?? []).filter((t) => matchQuery(t, search, ['name', 'plan']));
  const exportBilling = () => { downloadCsv(`sightlive-billing-${dateStamp()}`, [
    { key: 'name', label: 'Tenant' }, { key: 'plan', label: 'Plan' }, { key: 'seats', label: 'Seats' },
    { key: 'charge', label: 'Monthly charge', map: (t) => Number(t.charge?.total ?? 0).toFixed(2) },
    { key: 'invoice', label: 'Invoice status', map: (t) => (t.currentInvoice ? `${t.currentInvoice.status} (${Number(t.currentInvoice.total ?? 0).toFixed(2)})` : 'none') },
  ], shownTenants); triggerNotification('Export ready', `${shownTenants.length} tenants exported to CSV.`, 'success'); };

  return (
    <div className="card">
      <div className="card-hd" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wallet size={17} style={{ color: 'var(--primary)' }} /><h3>Plans &amp; billing</h3>
          {data && <span className="badge badge-success">MRR {rand(data.mrr)}</span>}
          {data && <span className="badge badge-neutral">{data.period}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {live && data?.tenants?.length > 0 && <SearchExportBar value={search} onChange={setSearch} placeholder="Search tenant, plan…" onExport={exportBilling} exportDisabled={!shownTenants.length} width={180} />}
          {live && <button className="btn btn-ghost btn-sm" onClick={reload} disabled={loading} aria-label="Refresh">{loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}</button>}
        </div>
      </div>
      {!live ? (
        <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>Connect the live backend to manage billing.</div>
      ) : !data ? (
        <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>{loading ? 'Loading…' : 'No billing data.'}</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Tenant</th><th className="center">Plan</th><th className="num">Seats</th><th className="num">Monthly charge</th><th>This period ({data.period})</th></tr></thead>
            <tbody>
              {shownTenants.length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 20 }}>No tenants match your search.</td></tr>}
              {shownTenants.map((t) => {
                const inv = t.currentInvoice;
                const busy = busyId === (inv?.id || t.id);
                return (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 500 }}>{t.name}</td>
                    <td className="center"><span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>{t.plan}</span></td>
                    <td className="num">{t.seats}</td>
                    <td className="num tabular">
                      {rand(t.charge.total)}
                      {t.charge.seatOverage > 0 && <div className="eyebrow">base {rand(t.charge.base)} + {t.charge.seatOverage} seats</div>}
                    </td>
                    <td>
                      {!inv ? (
                        <button className="btn btn-secondary btn-sm" disabled={busy || t.charge.total === 0} onClick={() => issue(t)}>{busy ? <Loader2 size={13} className="spin" /> : <FileText size={13} />} {t.charge.total === 0 ? 'Free plan' : 'Issue invoice'}</button>
                      ) : inv.status === 'paid' ? (
                        <span className="badge badge-success"><CheckCircle2 size={13} /> Paid {inv.paidAt ? `· ${String(inv.paidAt).slice(0, 10)}` : ''}</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span className="badge badge-warning">{inv.status} · {rand(inv.total)}</span>
                          <input className="input" placeholder="billing email" value={emailById[inv.id] ?? inv.payerEmail ?? ''} onChange={(e) => setEmailById((m) => ({ ...m, [inv.id]: e.target.value }))} style={{ width: 150, height: 30, fontSize: 12.5 }} />
                          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => charge(t, inv)}>{busy ? <Loader2 size={13} className="spin" /> : <CreditCard size={13} />} Charge</button>
                          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => verify(inv)}>Verify</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12, padding: '10px 14px', margin: 0 }}>Charges are metered live from plan + active seats (Merchant R990 · Plant R5,900 + R250/seat over 200 · Group R24,900 + R150/seat over 200). Issue → Charge opens a Paystack payment link for the tenant; Verify confirms it. Recurring auto-charge (card-on-file) is a future step.</p>
        </div>
      )}
    </div>
  );
};
