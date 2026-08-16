import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { fetchPurchaseOrders, updatePurchaseOrder, fetchPromotions, updatePromotion, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { SignaturePad } from './SignaturePad';
import {
  Bell, ShieldCheck, AlertTriangle, Check, X, Eye, ArrowRight, ClipboardList, PenLine, Loader2, Factory, BadgePercent
} from 'lucide-react';

const rands = (n, cur = 'ZAR') => `${cur === 'ZAR' ? 'R' : cur + ' '}${Number(n || 0).toLocaleString('en-ZA')}`;

// Live purchase-order approvals for managers. A PO submitted by the merchant
// lands here; the manager approves it with a captured signature or rejects it
// with a reason. Approval releases the PO back to the merchant to send.
const PoApprovals = () => {
  const { auth, tenantAccess, triggerNotification } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;
  const me = auth?.session?.user?.user_metadata?.display_name || auth?.session?.user?.email || 'Manager';
  const [orders, setOrders] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [signing, setSigning] = useState(null); // PO being approved
  const [signature, setSignature] = useState('');
  const [approverName, setApproverName] = useState(me);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!live) return;
    let active = true;
    fetchPurchaseOrders(scope).then((r) => { if (active) setOrders((r.orders ?? []).filter((p) => p.status === 'pending_approval')); }).catch(() => { if (active) setOrders([]); });
    return () => { active = false; };
  }, [live, scope.accessToken, scope.tenantId, scope.siteId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const approve = async () => {
    if (!signature) { triggerNotification('Signature required', 'Please sign to approve the purchase order.', 'warning'); return; }
    setBusy(true);
    try {
      await updatePurchaseOrder(signing.id, { action: 'approve', approverName, signature }, scope);
      triggerNotification('PO approved', `${signing.supplier} approved & signed — released to the merchant.`, 'success');
      setSigning(null); setSignature(''); setReloadKey((k) => k + 1);
    } catch (e) { triggerNotification('Approval failed', e.message || 'Could not approve.', 'danger'); } finally { setBusy(false); }
  };
  const reject = async () => {
    setBusy(true);
    try {
      await updatePurchaseOrder(rejecting.id, { action: 'reject', reason: reason || 'Rejected' }, scope);
      triggerNotification('PO rejected', `${rejecting.supplier} sent back to the merchant.`, 'info');
      setRejecting(null); setReason(''); setReloadKey((k) => k + 1);
    } catch (e) { triggerNotification('Reject failed', e.message || 'Could not reject.', 'danger'); } finally { setBusy(false); }
  };

  if (!live) return null;

  return (
    <div className="card">
      <div className="card-hd">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ClipboardList size={17} style={{ color: 'var(--primary)' }} /><h3>Purchase order approvals</h3></div>
        <span className={`badge ${orders.length ? 'badge-warning' : 'badge-neutral'}`}>{orders.length} waiting</span>
      </div>
      {orders.length === 0 ? (
        <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>No purchase orders are waiting for approval.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Reference</th><th>Supplier</th><th className="num">Lines</th><th className="num">Total</th><th>Submitted</th><th className="center">Decision</th></tr></thead>
            <tbody>
              {orders.map((po) => (
                <tr key={po.id}>
                  <td style={{ fontWeight: 500 }}>{po.reference || po.id.slice(0, 8)}</td>
                  <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Factory size={13} style={{ color: 'var(--text-subtle)' }} />{po.supplier}</span></td>
                  <td className="num">{po.lineCount}</td>
                  <td className="num tabular" style={{ fontWeight: 600 }}>{rands(po.total, po.currency)}</td>
                  <td className="muted">{(po.submittedAt || po.createdAt || '').slice(0, 10)}</td>
                  <td className="center" style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => { setApproverName(me); setSignature(''); setSigning(po); }}><PenLine size={13} /> Approve &amp; sign</button>
                    <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }} onClick={() => { setReason(''); setRejecting(po); }}><X size={13} /> Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Approve + signature modal */}
      {signing && (
        <div className="overlay" onClick={busy ? undefined : () => setSigning(null)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><PenLine size={18} style={{ color: 'var(--primary)' }} /><h3>Approve purchase order</h3></div>
              <button className="icon-btn" onClick={() => setSigning(null)} aria-label="Close"><X size={17} /></button>
            </div>
            <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
                <div className="card-bd" style={{ padding: 12, fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{signing.supplier}</div>
                  <div className="muted">{signing.lineCount} line(s) · <strong>{rands(signing.total, signing.currency)}</strong>{signing.reference ? ` · ${signing.reference}` : ''}</div>
                </div>
              </div>
              <div className="field"><label className="field-label">Approver</label>
                <input className="input" value={approverName} onChange={(e) => setApproverName(e.target.value)} /></div>
              <div className="field"><label className="field-label">Signature</label>
                <SignaturePad onChange={setSignature} /></div>
            </div>
            <div className="modal-ft" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary" onClick={() => setSigning(null)} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={approve} disabled={busy || !signature}>{busy ? <><Loader2 size={15} className="spin" /> Approving…</> : 'Approve & release'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejecting && (
        <div className="overlay" onClick={busy ? undefined : () => setRejecting(null)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd"><h3>Reject purchase order</h3></div>
            <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p className="muted" style={{ fontSize: 13 }}>{rejecting.supplier} · {rands(rejecting.total, rejecting.currency)}. The merchant can revise and re-submit.</p>
              <div className="field"><label className="field-label">Reason</label>
                <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. over budget for Q3 — reduce boot quantity" /></div>
            </div>
            <div className="modal-ft" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary" onClick={() => setRejecting(null)} disabled={busy}>Cancel</button>
              <button className="btn btn-danger" onClick={reject} disabled={busy}>{busy ? <><Loader2 size={15} className="spin" /> Rejecting…</> : 'Reject PO'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Promotions sent to managers for visibility/history. Promos are NOT gated —
// they activate on creation — so this is a record the manager acknowledges.
const PromoSubmissions = () => {
  const { auth, tenantAccess, triggerNotification } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;
  const me = auth?.session?.user?.user_metadata?.display_name || auth?.session?.user?.email || 'Manager';
  const [promos, setPromos] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!live) { setPromos([]); return; }
    let active = true;
    fetchPromotions(scope).then((r) => { if (active) setPromos(Array.isArray(r?.promotions) ? r.promotions : []); }).catch(() => { if (active) setPromos([]); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, scope.accessToken, scope.tenantId, scope.siteId, reloadKey]);

  const acknowledge = async (p) => {
    setBusyId(p.id);
    try {
      await updatePromotion(p.id, { action: 'acknowledge', managerName: me }, scope);
      triggerNotification('Promo noted', `${p.sku || 'Promotion'} (−${p.discountPct || 0}%) acknowledged.`, 'success');
      setReloadKey((k) => k + 1);
    } catch (e) { triggerNotification('Failed', e.message || 'Could not acknowledge.', 'danger'); } finally { setBusyId(null); }
  };

  if (!live) return null;

  return (
    <div className="card">
      <div className="card-hd">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BadgePercent size={17} style={{ color: 'var(--primary)' }} /><h3>Promotions sent to managers</h3></div>
        <span className={`badge ${promos.length ? 'badge-info' : 'badge-neutral'}`}>{promos.length} total</span>
      </div>
      {promos.length === 0 ? (
        <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>No promotions have been sent to managers yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Product</th><th>Type</th><th className="num">Discount</th><th className="num">New cost basis</th><th>Created</th><th className="center">Seen by manager</th><th className="center">Action</th></tr></thead>
            <tbody>
              {promos.map((p, idx) => {
                if (!p) return null;
                const cost = Number(p.costAtCreate ?? 0);
                const pct = Number(p.discountPct ?? 0);
                const validPct = isNaN(pct) ? 0 : pct;
                const newCost = cost * (1 - validPct / 100);
                return (
                  <tr key={p.id || p.sku || idx}>
                    <td style={{ fontWeight: 500 }}>{p.sku || '—'}</td>
                    <td className="muted" style={{ textTransform: 'capitalize' }}>{String(p.promoType ?? 'markdown')}</td>
                    <td className="num">−{validPct}%</td>
                    <td className="num tabular">R {isNaN(newCost) ? '0.00' : newCost.toFixed(2)}</td>
                    <td className="muted">{(p.createdAt || '').slice(0, 10)}</td>
                    <td className="center">{p.acknowledgedBy ? <span className="badge badge-success">{p.acknowledgedBy}</span> : <span className="badge badge-neutral">not seen</span>}</td>
                    <td className="center">
                      {p.acknowledgedBy
                        ? <span className="muted" style={{ fontSize: 12 }}>✓ noted</span>
                        : <button className="btn btn-secondary btn-sm" disabled={busyId === p.id} onClick={() => acknowledge(p)}>{busyId === p.id ? <><Loader2 size={13} className="spin" /> …</> : 'Acknowledge'}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Approval history — POs that have already been decided (approved / rejected /
// sent / received), so a manager can review what was approved and when.
const PoApprovalHistory = () => {
  const { auth, tenantAccess } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;
  const [history, setHistory] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!live) { setHistory([]); return; }
    let active = true;
    fetchPurchaseOrders(scope).then((r) => {
      if (!active) return;
      setHistory((r.orders ?? []).filter((p) => p.status !== 'draft' && p.status !== 'pending_approval'));
    }).catch(() => { if (active) setHistory([]); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, scope.accessToken, scope.tenantId, scope.siteId, reloadKey]);

  if (!live) return null;
  const sb = { approved: 'badge-success', rejected: 'badge-danger', sent: 'badge-info', received: 'badge-success' };

  return (
    <div className="card">
      <div className="card-hd">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ClipboardCheck size={17} style={{ color: 'var(--primary)' }} /><h3>PO approval history</h3></div>
        <span className={`badge ${history.length ? 'badge-neutral' : 'badge-neutral'}`}>{history.length} decided</span>
      </div>
      {history.length === 0 ? (
        <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>No purchase orders have been approved or rejected yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Reference</th><th>Supplier</th><th className="num">Total</th><th className="center">Decision</th><th>Approved by</th><th>Date</th></tr></thead>
            <tbody>
              {history.map((po) => (
                <tr key={po.id}>
                  <td style={{ fontWeight: 500 }}>{po.reference || po.id.slice(0, 8)}</td>
                  <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Factory size={13} style={{ color: 'var(--text-subtle)' }} />{po.supplier}</span></td>
                  <td className="num tabular">R {Number(po.total || 0).toLocaleString('en-ZA')}</td>
                  <td className="center"><span className={`badge ${sb[po.status] || 'badge-neutral'}`}>{String(po.status).replace(/_/g, ' ')}</span></td>
                  <td className="muted">{po.approvedBy || (po.status === 'rejected' ? 'rejected' : '—')}</td>
                  <td className="muted">{(po.approvedAt || po.submittedAt || po.createdAt || '').slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const ManagerApprovalPortal = () => {
  const { requests, approveRequest, rejectRequest, triggerNotification } = useApp();
  const [declining, setDeclining] = useState(null);
  const [declineReason, setDeclineReason] = useState('');
  const [tier, setTier] = useState('TIER2');

  const pending = requests.filter(r => r.status === 'PENDING_APPROVAL');

  const approve = (id) => approveRequest(id, tier === 'TIER2' ? 2 : 1, tier === 'TIER2' ? 'Section Manager' : 'Shift Supervisor');
  const submitDecline = (e) => {
    e.preventDefault();
    if (!declining || !declineReason) return;
    rejectRequest(declining.id, declineReason);
    setDeclining(null); setDeclineReason('');
  };
  const pushAlert = (req) => triggerNotification('Approval needed', `${req.employeeName} — ${req.itemName} needs ${req.approvalTierRequired === 2 ? 'Section Manager co-sign' : 'supervisor approval'}.`, 'warning');

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 24 }}>
      <div className="page-head">
        <div>
          <h2>Approvals</h2>
          <p>Value over R750, a repeat issue within 30 days, or a non-standard item forces a Section Manager co-sign. Both signatures land on the issue record.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="badge badge-primary">{pending.length} waiting</span>
          <div className="segment">
            <button className={tier === 'TIER1' ? 'on' : ''} onClick={() => setTier('TIER1')}>Supervisor</button>
            <button className={tier === 'TIER2' ? 'on accent' : ''} onClick={() => setTier('TIER2')}>Section Manager</button>
          </div>
        </div>
      </div>

      <PoApprovals />
      <PromoSubmissions />
      <PoApprovalHistory />

      {pending.length === 0 ? (
        <div className="card">
          <div className="card-bd" style={{ textAlign: 'center', padding: '48px 20px' }}>
            <ShieldCheck size={40} style={{ color: 'var(--success)' }} />
            <h3 style={{ marginTop: 12 }}>All approval queues clear</h3>
            <p className="muted" style={{ marginTop: 6, fontSize: 13.5 }}>No PPE requests are waiting on a signature.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {pending.map(req => (
            <div key={req.id} className="card">
              <div className="card-hd">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="badge badge-neutral">{req.id}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{req.itemName}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{req.employeeName} · {req.department}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`badge ${req.approvalTierRequired === 2 ? 'badge-primary' : 'badge-info'}`}>Requires Tier {req.approvalTierRequired}</span>
                  <button className="icon-btn" title="Simulate push" onClick={() => pushAlert(req)}><Bell size={17} /></button>
                </div>
              </div>
              <div className="card-bd">
                <div className="cols cols-3">
                  <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
                    <div className="card-bd" style={{ padding: 14 }}>
                      <div className="eyebrow">Financial impact</div>
                      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>R {(req.costPrice ?? 0).toFixed(2)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>Selling R {(req.sellingPrice ?? 0).toFixed(2)}</div>
                    </div>
                  </div>
                  <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
                    <div className="card-bd" style={{ padding: 14 }}>
                      <div className="eyebrow">Reason</div>
                      <div style={{ fontSize: 14, fontWeight: 500, marginTop: 5 }}>{req.reason}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{req.requestDate}</div>
                    </div>
                  </div>
                  <div className="card" style={{ boxShadow: 'none', background: req.isEarlyReplacement ? 'var(--danger-weak)' : 'var(--surface-2)' }}>
                    <div className="card-bd" style={{ padding: 14 }}>
                      <div className="eyebrow">Anti-theft check</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 600, marginTop: 5, color: req.isEarlyReplacement ? 'var(--danger)' : 'var(--success)' }}>
                        {req.isEarlyReplacement ? <><AlertTriangle size={15} /> Early replacement</> : <><ShieldCheck size={15} /> Normal quota</>}
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Category {req.abcClass} item</div>
                    </div>
                  </div>
                </div>

                {req.isEarlyReplacement && req.photoProofUrl && (
                  <div className="card" style={{ marginTop: 14, boxShadow: 'none', background: 'var(--danger-weak)', borderColor: 'var(--primary-weak-bd)' }}>
                    <div className="card-bd" style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div className="thumb" style={{ width: 84, height: 56 }}><Eye size={20} /></div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>Photo evidence attached</div>
                        <a href={req.photoProofUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>View damaged item <ArrowRight size={13} /></a>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                  <button className="btn btn-danger" onClick={() => setDeclining(req)}><X size={16} /> Decline &amp; flag</button>
                  <button className="btn btn-primary" onClick={() => approve(req.id)}><Check size={16} /> {tier === 'TIER2' ? 'Co-approve & authorize' : 'Approve'}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {declining && (
        <div className="overlay" onClick={() => setDeclining(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <h3>Decline {declining.id}</h3>
              <button className="icon-btn" onClick={() => setDeclining(null)}><X size={18} /></button>
            </div>
            <form onSubmit={submitDecline} className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="field-label">Audit reason (required)</label>
                <textarea className="textarea" value={declineReason} onChange={e => setDeclineReason(e.target.value)} placeholder="e.g. photo inconclusive, quota exceeded without incident report…" required />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setDeclining(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Confirm rejection</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
