import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Bell, ShieldCheck, AlertTriangle, Check, X, Eye, ArrowRight
} from 'lucide-react';

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
                      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>R {req.costPrice.toFixed(2)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>Selling R {req.sellingPrice.toFixed(2)}</div>
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
