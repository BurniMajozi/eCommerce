import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { fetchPurchaseOrders, fetchOrders, updatePurchaseOrder, escalateApproval, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { PoApprovalHistory, RequestApprovalHistory } from './ManagerApprovalPortal';
import { SearchExportBar, matchQuery } from './TableToolbar';
import { downloadCsv, dateStamp } from '../utils/exportCsv';
import {
  ArrowUpCircle, Clock, Factory, HardHat, ClipboardList, Loader2, Mail, X, ShieldAlert, RefreshCcw, Check
} from 'lucide-react';

const rands = (n, cur = 'ZAR') => `${cur === 'ZAR' ? 'R' : cur + ' '}${Number(n || 0).toLocaleString('en-ZA')}`;
const daysSince = (d) => { if (!d) return null; const t = Date.parse(d); if (Number.isNaN(t)) return null; return Math.max(0, Math.floor((Date.now() - t) / 86400000)); };
const STUCK_DAYS = 2; // older than this is highlighted as "stuck"

// Merchant escalation view. The merchant can SEE stuck approvals and nudge the
// responsible approver — but never approve or sign (backend enforces that too).
// Escalating always flags the item in-app; an opt-in checkbox also emails the
// approver via AgentMail. Approval history is reused from the manager portal.
export const MerchantApprovalsPortal = () => {
  const { auth, tenantAccess, requests, triggerNotification } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;

  const [poItems, setPoItems] = useState([]);
  const [replenPos, setReplenPos] = useState([]); // replenishment POs awaiting merchant approval
  const [decidingId, setDecidingId] = useState(null);
  const [rejecting, setRejecting] = useState(null); // replenishment PO being rejected
  const [rejectReason, setRejectReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [escalating, setEscalating] = useState(null); // item being escalated
  const [note, setNote] = useState('');
  const [alsoEmail, setAlsoEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [escalated, setEscalated] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('sl_escalated') || '[]')); } catch { return new Set(); }
  });

  const markEscalated = useCallback((ref) => {
    setEscalated((prev) => {
      const next = new Set(prev); next.add(ref);
      try { localStorage.setItem('sl_escalated', JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Pending POs + internal (mine) B2B orders waiting on an approver's decision.
  useEffect(() => {
    if (!live) { setPoItems([]); return undefined; }
    let active = true;
    setLoading(true);
    (async () => {
      const [poRes, orderRes] = await Promise.all([
        fetchPurchaseOrders(scope).catch(() => ({ orders: [] })),
        fetchOrders(scope).catch(() => ({ orders: [] })),
      ]);
      const allPos = poRes.orders ?? [];
      // Replenishment POs the merchant can approve directly (their own queue).
      const replen = allPos
        .filter((p) => p.origin === 'replenishment' && p.status === 'pending_approval')
        .map((p) => ({
          id: p.id, reference: p.reference || p.id, supplier: p.supplier || 'Supplier',
          total: p.total, currency: p.currency || 'ZAR',
          lines: Array.isArray(p.lines) ? p.lines : [],
          lineCount: Array.isArray(p.lines) ? p.lines.length : (p.lineCount || 0),
          at: p.submittedAt || p.createdAt || '',
        }))
        .sort((a, b) => String(b.at).localeCompare(String(a.at)));
      // Everything else pending is a "stuck approval" the merchant escalates
      // (exclude replenishment — it has its own approve section above).
      const pos = allPos
        .filter((p) => p.origin !== 'replenishment' && ['pending_approval', 'submitted', 'submit', 'draft'].includes(p.status))
        .map((p) => ({
          key: p.id, kind: 'po', reference: p.reference || p.id,
          subject: p.supplier || 'Purchase order',
          total: p.total, currency: p.currency || 'ZAR',
          lineCount: Array.isArray(p.lines) ? p.lines.length : (p.lineCount || 0),
          at: p.submittedAt || p.createdAt || '',
        }));
      const mine = (orderRes.orders ?? [])
        .filter((o) => {
          const s = (o.supplier || '').trim();
          const isMine = /mine|plant|shaft|kumba|kolomela|tenke|sishen|amandelbult|thabazimbi|internal|site|cageli/i.test(s);
          return isMine && !['approved', 'received', 'rejected'].includes(o.status);
        })
        .map((o) => ({
          key: `b2b-${o.id}`, kind: 'po',
          reference: `B2B Order #${o.displayId || o.id?.slice(0, 8)}`,
          subject: o.supplier || 'Internal mine order',
          total: o.total || 0, currency: (o.currencyCode || 'ZAR').toUpperCase(),
          lineCount: (o.items ?? []).length || 1,
          at: o.createdAt || '',
        }));
      if (active) { setPoItems([...pos, ...mine]); setReplenPos(replen); setLoading(false); }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, scope.accessToken, scope.tenantId, scope.siteId, reloadKey]);

  // Pending PPE issue requests (from app request state) awaiting a manager co-sign.
  const requestItems = (requests || [])
    .filter((r) => r.status === 'PENDING_APPROVAL')
    .map((r) => ({
      key: r.id, kind: 'request', reference: r.id,
      subject: `${r.itemName}${r.employeeName ? ` · ${r.employeeName}` : ''}`,
      total: r.sellingPrice ?? r.costPrice ?? null, currency: 'ZAR',
      tier: r.approvalTierRequired, at: r.requestDate || '',
    }));

  const [waitSearch, setWaitSearch] = useState('');
  const allItems = [...poItems, ...requestItems]
    .map((it) => ({ ...it, ageDays: daysSince(it.at) }))
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));
  const items = allItems.filter((it) => matchQuery(it, waitSearch, ['reference', 'subject', 'kind']));
  const stuckCount = items.filter((it) => (it.ageDays ?? 0) >= STUCK_DAYS).length;
  const exportWaiting = () => { downloadCsv(`sightlive-waiting-approvals-${dateStamp()}`, [
    { key: 'kind', label: 'Type', map: (it) => (it.kind === 'po' ? 'PO / order' : `PPE${it.tier ? ` Tier ${it.tier}` : ''}`) },
    { key: 'subject', label: 'Item' }, { key: 'reference', label: 'Reference' },
    { key: 'total', label: 'Value', map: (it) => (it.total == null ? '' : Number(it.total).toFixed(2)) },
    { key: 'currency', label: 'Currency', map: (it) => it.currency || 'ZAR' },
    { key: 'ageDays', label: 'Waiting (days)', map: (it) => it.ageDays ?? '' },
  ], items); triggerNotification('Export ready', `${items.length} waiting approvals exported to CSV.`, 'success'); };

  const openEscalate = (it) => { setNote(''); setAlsoEmail(false); setEscalating(it); };
  const submitEscalate = async () => {
    if (!escalating) return;
    setBusy(true);
    try {
      const r = await escalateApproval({
        kind: escalating.kind, reference: escalating.reference,
        subject: escalating.subject, note: note.trim(), ageDays: escalating.ageDays, email: alsoEmail,
      }, scope);
      markEscalated(escalating.reference);
      if (alsoEmail && r?.emailed) triggerNotification('Escalated & emailed', `${escalating.subject} — approver notified by email.`, 'success');
      else if (alsoEmail && !r?.emailed) triggerNotification('Escalated (email skipped)', r?.reason === 'email_not_configured' ? 'Flagged. Email is not configured on this tenant.' : 'Flagged. No approver email was available to notify.', 'warning');
      else triggerNotification('Approval escalated', `${escalating.subject} flagged for the approver.`, 'success');
      setEscalating(null);
    } catch (e) {
      triggerNotification('Escalation failed', e?.message || 'Could not escalate this approval.', 'danger');
    } finally { setBusy(false); }
  };

  // Merchant decision on a replenishment order (system-generated → merchant approves).
  const me = auth?.session?.user?.user_metadata?.display_name || auth?.session?.user?.email || 'Merchant';
  const approveReplen = async (po) => {
    setDecidingId(po.id);
    try {
      await updatePurchaseOrder(po.id, { action: 'approve', approverName: me }, scope);
      triggerNotification('Replenishment approved', `${po.supplier} · ${rands(po.total, po.currency)} approved — ready to send to the supplier.`, 'success');
      setReplenPos((prev) => prev.filter((x) => x.id !== po.id));
    } catch (e) { triggerNotification('Approval failed', e?.message || 'Could not approve the order.', 'danger'); }
    finally { setDecidingId(null); }
  };
  const submitRejectReplen = async () => {
    if (!rejecting) return;
    setDecidingId(rejecting.id);
    try {
      await updatePurchaseOrder(rejecting.id, { action: 'reject', reason: rejectReason.trim() || 'Not required' }, scope);
      triggerNotification('Replenishment rejected', `${rejecting.supplier} order rejected.`, 'info');
      setReplenPos((prev) => prev.filter((x) => x.id !== rejecting.id));
      setRejecting(null); setRejectReason('');
    } catch (e) { triggerNotification('Reject failed', e?.message || 'Could not reject the order.', 'danger'); }
    finally { setDecidingId(null); }
  };
  const replenTotal = replenPos.reduce((a, p) => a + Number(p.total || 0), 0);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 24 }}>
      <div className="page-head">
        <div>
          <h2>Approvals</h2>
          <p>Approve auto-raised <strong>replenishment</strong> orders here. For other stuck approvals you can flag &amp; nudge the responsible approver (approving PPE/manual POs stays with the mine manager).</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {replenPos.length > 0 && <span className="badge badge-warning">{replenPos.length} replenishment</span>}
          <span className={`badge ${stuckCount ? 'badge-danger' : 'badge-neutral'}`}>{stuckCount} stuck &ge; {STUCK_DAYS}d</span>
          <span className="badge badge-primary">{items.length} waiting</span>
        </div>
      </div>

      {/* Replenishment orders the merchant approves directly */}
      {replenPos.length > 0 && (
        <div className="card">
          <div className="card-hd">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <RefreshCcw size={17} style={{ color: 'var(--primary)' }} />
              <h3>Replenishment orders to approve</h3>
              <span className="badge badge-warning">{replenPos.length} · {rands(replenTotal, replenPos[0]?.currency)}</span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Reference</th><th>Supplier</th><th className="num">Lines</th><th className="num">Total</th><th className="center">Decision</th></tr></thead>
              <tbody>
                {replenPos.map((po) => (
                  <tr key={po.id}>
                    <td style={{ fontWeight: 500 }}>{po.reference}</td>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Factory size={13} style={{ color: 'var(--text-subtle)' }} />{po.supplier}</span></td>
                    <td className="num">{po.lineCount}</td>
                    <td className="num tabular" style={{ fontWeight: 600 }}>{rands(po.total, po.currency)}</td>
                    <td className="center" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-primary btn-sm" disabled={decidingId === po.id} onClick={() => approveReplen(po)}>{decidingId === po.id ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Approve</button>
                      <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }} disabled={decidingId === po.id} onClick={() => { setRejectReason(''); setRejecting(po); }}><X size={13} /> Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 11.5, padding: '10px 14px', margin: 0 }}>Auto-raised by the replenishment engine when forward cover fell to lead time + buffer. Approving sends the order to the supplier; rejecting discards it.</p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-hd" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ClipboardList size={17} style={{ color: 'var(--primary)' }} /><h3>Waiting on an approver</h3>{waitSearch && <span className="badge badge-neutral">{items.length} of {allItems.length}</span>}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {allItems.length > 0 && <SearchExportBar value={waitSearch} onChange={setWaitSearch} placeholder="Search item, reference…" onExport={exportWaiting} exportDisabled={!items.length} width={190} />}
            {live && <button className="btn btn-ghost btn-sm" onClick={() => setReloadKey((k) => k + 1)} disabled={loading} aria-label="Refresh">{loading ? <Loader2 size={14} className="spin" /> : 'Refresh'}</button>}
          </div>
        </div>
        {items.length === 0 ? (
          <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>{loading ? 'Loading…' : (waitSearch ? 'No waiting approvals match your search.' : 'Nothing is waiting on an approval right now.')}</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Type</th><th>Item</th><th className="num">Value</th><th className="center">Waiting</th><th className="center">Action</th></tr></thead>
              <tbody>
                {items.map((it) => {
                  const stuck = (it.ageDays ?? 0) >= STUCK_DAYS;
                  const done = escalated.has(it.reference);
                  return (
                    <tr key={it.key} style={stuck ? { background: 'var(--danger-weak)' } : undefined}>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {it.kind === 'po' ? <Factory size={13} style={{ color: 'var(--text-subtle)' }} /> : <HardHat size={13} style={{ color: 'var(--text-subtle)' }} />}
                          <span className="badge badge-neutral" style={{ fontSize: 10.5 }}>{it.kind === 'po' ? 'PO / order' : `PPE${it.tier ? ` · Tier ${it.tier}` : ''}`}</span>
                        </span>
                      </td>
                      <td style={{ fontWeight: 500 }}>{it.subject}<div className="eyebrow" style={{ marginTop: 2 }}>{it.reference}</div></td>
                      <td className="num tabular">{it.total == null ? '—' : rands(it.total, it.currency)}</td>
                      <td className="center">
                        {it.ageDays == null ? <span className="muted">—</span>
                          : <span className={`badge ${stuck ? 'badge-danger' : 'badge-neutral'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={11} />{it.ageDays}d</span>}
                      </td>
                      <td className="center">
                        <button className={`btn btn-sm ${done ? 'btn-secondary' : 'btn-primary'}`} onClick={() => openEscalate(it)}>
                          <ArrowUpCircle size={13} /> {done ? 'Escalated · again' : 'Escalate'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 11.5, padding: '10px 14px', margin: 0 }}>Items older than {STUCK_DAYS} days are highlighted as stuck. Escalating records the nudge in the tenant audit trail and, if you tick “email the approver”, sends a reminder via email.</p>
          </div>
        )}
      </div>

      {/* Approval history — reused from the manager portal */}
      <div className="page-head" style={{ marginBottom: 0, marginTop: 6 }}>
        <div><h2 style={{ fontSize: 18 }}>Approval history</h2><p style={{ fontSize: 13 }}>What has already been approved, rejected or received — searchable and exportable.</p></div>
      </div>
      <PoApprovalHistory />
      <RequestApprovalHistory />

      {/* Escalate dialog */}
      {escalating && (
        <div className="overlay" onClick={busy ? undefined : () => setEscalating(null)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><ShieldAlert size={18} style={{ color: 'var(--primary)' }} /><h3>Escalate approval</h3></div>
              <button className="icon-btn" onClick={() => setEscalating(null)} aria-label="Close"><X size={17} /></button>
            </div>
            <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 18px' }}>
              <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
                <div className="card-bd" style={{ padding: '8px 12px', fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{escalating.subject}</div>
                  <div className="muted">{escalating.reference}{escalating.ageDays != null ? ` · waiting ${escalating.ageDays} day(s)` : ''}</div>
                </div>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label" style={{ marginBottom: 4 }}>Note to the approver (optional)</label>
                <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. the mine needs these boots before Friday's shift — please review." />
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={alsoEmail} onChange={(e) => setAlsoEmail(e.target.checked)} style={{ marginTop: 2 }} />
                <span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 500 }}><Mail size={13} /> Also email the approver</span><div className="muted" style={{ fontSize: 12 }}>Sends a reminder to the tenant’s approvers. Uses an email send — leave off to flag in-app only.</div></span>
              </label>
            </div>
            <div className="modal-ft" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary" onClick={() => setEscalating(null)} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={submitEscalate} disabled={busy}>{busy ? <><Loader2 size={15} className="spin" /> Escalating…</> : <><ArrowUpCircle size={15} /> Escalate</>}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject a replenishment order */}
      {rejecting && (
        <div className="overlay" onClick={decidingId ? undefined : () => setRejecting(null)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Reject replenishment order</h3>
              <button className="icon-btn" onClick={() => setRejecting(null)} aria-label="Close"><X size={17} /></button>
            </div>
            <div className="modal-bd" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>{rejecting.supplier} · {rands(rejecting.total, rejecting.currency)}. The order will be discarded and not sent.</p>
              <div className="field" style={{ margin: 0 }}><label className="field-label">Reason (optional)</label>
                <textarea className="input" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. covered by an existing PO / over budget this cycle" /></div>
            </div>
            <div className="modal-ft" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary" onClick={() => setRejecting(null)} disabled={!!decidingId}>Cancel</button>
              <button className="btn btn-danger" onClick={submitRejectReplen} disabled={!!decidingId}>{decidingId ? <><Loader2 size={15} className="spin" /> Rejecting…</> : 'Reject order'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
