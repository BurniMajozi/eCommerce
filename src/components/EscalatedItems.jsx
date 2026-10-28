import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { fetchTickets, updateTicket, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { SearchExportBar, matchQuery } from './TableToolbar';
import { downloadCsv, dateStamp } from '../utils/exportCsv';
import { TicketDetailModal, CAT } from './TicketsPortal';
import { ArrowUpCircle, Loader2, RefreshCcw, Clock, Check, X, MessageSquare, Ticket } from 'lucide-react';

const rands = (n, cur = 'ZAR') => `${cur === 'ZAR' ? 'R' : cur + ' '}${Number(n || 0).toLocaleString('en-ZA')}`;
const since = (d) => { if (!d) return null; const t = Date.parse(d); if (Number.isNaN(t)) return null; const days = Math.floor((Date.now() - t) / 86400000); return days <= 0 ? 'today' : `${days}d ago`; };
const STATUS_BADGE = { open: 'badge-neutral', pending_approval: 'badge-warning', in_progress: 'badge-info', approved: 'badge-success', rejected: 'badge-danger', resolved: 'badge-success' };

// The escalation queue as tickets: what has been flagged to the responsible
// approver, who they can resolve (approve/reject) right here — the escalation is
// closed within the approval journey. Reused by the Escalations view (any role)
// and the Approvals view (Tier 2 manager). null rows = loading (no stale flash).
export const EscalatedItems = ({ title = 'Escalated to the approver', subtitle }) => {
  const { auth, tenantAccess, triggerNotification } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const me = auth?.session?.user?.user_metadata?.display_name || auth?.session?.user?.email || 'Me';
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;
  const scopeKey = live ? `${scope.tenantId}:${scope.siteId ?? '*'}` : null;
  const demo = !tenantAccess || tenantAccess.mode === 'demo';
  const canDecide = demo || ['ppe.approve.tier1', 'ppe.approve.tier2', 'platform.manage', 'commerce.manage'].some((c) => tenantAccess.hasCapability?.(c));

  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => { setReloadKey((k) => k + 1); }, []);
  useEffect(() => {
    if (!live) { setRows([]); setError(null); return undefined; }
    let active = true;
    setRows(null); setError(null);
    fetchTickets(scope, { escalated: 'true' })
      .then((r) => { if (active) setRows(Array.isArray(r?.tickets) ? r.tickets : []); })
      .catch((e) => { if (active) { setRows([]); setError(e); } });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, scopeKey, reloadKey]);

  if (!live) return null;
  const loading = rows === null;
  const all = rows ?? [];
  const shown = all.filter((it) => matchQuery(it, search, ['commonKey', 'reference', 'subject', 'escalatedBy', 'category']));
  const decidable = (t) => ['open', 'pending_approval', 'in_progress'].includes(t.status);

  const resolve = async (t, decision) => {
    setBusyId(t.id);
    try {
      await updateTicket(t.id, { action: 'resolve', decision, approverName: me }, scope);
      triggerNotification(decision === 'approve' ? 'Escalation approved' : 'Escalation rejected', `${t.commonKey} · ${t.subject}`, decision === 'approve' ? 'success' : 'info');
      load();
    } catch (e) { triggerNotification('Could not resolve', e?.message || 'Please try again.', 'danger'); }
    finally { setBusyId(null); }
  };

  const exportRows = () => downloadCsv(`sightlive-escalated-tickets-${dateStamp()}`, [
    { key: 'commonKey', label: 'Ticket' }, { key: 'category', label: 'Type', map: (t) => CAT[t.category]?.label || t.category },
    { key: 'subject', label: 'Item' }, { key: 'reference', label: 'Reference', map: (t) => t.reference || '' },
    { key: 'escalatedBy', label: 'Escalated by', map: (t) => t.escalatedBy || '' },
    { key: 'status', label: 'Status' }, { key: 'value', label: 'Value', map: (t) => (t.value == null ? '' : Number(t.value).toFixed(2)) },
  ], shown);

  return (
    <div className="card">
      <div className="card-hd" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ArrowUpCircle size={17} style={{ color: 'var(--primary)' }} />
          <h3>{title}</h3>
          <span className={`badge ${all.length ? 'badge-warning' : 'badge-neutral'}`}>{all.length} escalated</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {all.length > 0 && <SearchExportBar value={search} onChange={setSearch} placeholder="Search ticket, item…" onExport={exportRows} exportDisabled={!shown.length} width={190} />}
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading} aria-label="Refresh">{loading ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}</button>
        </div>
      </div>
      {subtitle && <p className="muted" style={{ fontSize: 12, padding: '0 16px 4px' }}>{subtitle}</p>}
      {loading ? (
        <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>Loading escalations…</div>
      ) : error ? (
        <div className="card-bd" style={{ padding: 16, fontSize: 13.5 }}><span style={{ color: 'var(--danger)' }}>Couldn’t load escalations.</span> <button className="btn btn-ghost btn-sm" onClick={load}>Retry</button></div>
      ) : shown.length === 0 ? (
        <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>{search ? 'No escalations match your search.' : 'Nothing is escalated right now.'}</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Ticket</th><th>Item</th><th>Escalated by</th><th className="center">When</th><th className="num">Value</th><th className="center">Status</th><th className="center">Resolve</th></tr></thead>
            <tbody>
              {shown.map((t) => {
                const c = CAT[t.category] || { label: t.category, icon: Ticket };
                const CIcon = c.icon;
                const busy = busyId === t.id;
                return (
                  <tr key={t.id} style={{ background: 'var(--danger-weak)' }}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t.commonKey}<div className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}><CIcon size={11} />{c.label}</div></td>
                    <td style={{ fontWeight: 500 }}>{t.subject}{t.reference ? <div className="eyebrow" style={{ marginTop: 2 }}>{t.reference}</div> : null}</td>
                    <td className="muted">{t.escalatedBy || '—'}</td>
                    <td className="center">{t.escalatedAt ? <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={11} />{since(t.escalatedAt)}</span> : '—'}</td>
                    <td className="num tabular">{t.value == null ? '—' : rands(t.value, t.currency)}</td>
                    <td className="center"><span className={`badge ${STATUS_BADGE[t.status] || 'badge-neutral'}`}>{String(t.status).replace(/_/g, ' ')}</span></td>
                    <td className="center" style={{ whiteSpace: 'nowrap' }}>
                      {decidable(t) && canDecide ? (
                        <>
                          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => resolve(t, 'approve')}>{busy ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Approve</button>
                          <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }} disabled={busy} onClick={() => resolve(t, 'reject')}><X size={13} /> Reject</button>
                        </>
                      ) : (
                        <button className="btn btn-secondary btn-sm" onClick={() => setOpenId(t.id)}><MessageSquare size={13} /> Open</button>
                      )}
                      {decidable(t) && canDecide && <button className="icon-btn" title="Open ticket & notes" style={{ marginLeft: 6 }} onClick={() => setOpenId(t.id)}><MessageSquare size={14} /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 11.5, padding: '10px 14px', margin: 0 }}>Approve or reject here to resolve the escalation within the approval journey. Open a ticket to add notes or read the full history.</p>
        </div>
      )}
      {openId && <TicketDetailModal ticketId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
};
