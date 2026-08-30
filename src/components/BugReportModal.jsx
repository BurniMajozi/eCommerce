import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { reportBug, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { Bug, X, Loader2, Send } from 'lucide-react';

const SEVERITIES = [
  { key: 'low', label: 'Low' },
  { key: 'normal', label: 'Normal' },
  { key: 'high', label: 'High' },
  { key: 'critical', label: 'Critical' },
];

// Any user can report a bug/feedback. Captures the current view + browser so the
// platform owner can triage without a back-and-forth. No-ops gracefully if the
// live backend isn't connected.
export const BugReportModal = ({ onClose }) => {
  const { auth, tenantAccess, activeRole, triggerNotification } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('normal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!title.trim()) { setError('Add a short title.'); return; }
    if (!live) { triggerNotification('Not connected', 'Bug reporting needs the live backend.', 'info'); onClose(); return; }
    setBusy(true); setError(null);
    try {
      await reportBug({
        title: title.trim(),
        description: description.trim(),
        severity,
        route: activeRole || (typeof window !== 'undefined' ? window.location.pathname : ''),
        reporterEmail: auth?.user?.email || null,
        reporterName: auth?.user?.user_metadata?.display_name || null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      }, scope);
      triggerNotification('Bug reported', 'Thanks — the platform team has been notified.', 'success');
      onClose();
    } catch (e) {
      setError(e?.message || 'Could not send the report.');
    } finally { setBusy(false); }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Bug size={18} style={{ color: 'var(--primary)' }} /><h3>Report a bug</h3></div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label className="field-label">What went wrong?</label>
            <input className="input" placeholder="Short summary" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
          </div>
          <div className="field">
            <label className="field-label">Details <span className="muted">(steps, what you expected)</span></label>
            <textarea className="textarea" rows={4} placeholder="What did you do, and what happened instead?" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-label">Severity</label>
            <div className="cols cols-4" style={{ gap: 8 }}>
              {SEVERITIES.map((s) => (
                <button type="button" key={s.key} className={`btn btn-sm ${severity === s.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSeverity(s.key)}>{s.label}</button>
              ))}
            </div>
          </div>
          <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>We attach the screen you're on and your browser so the team can reproduce it.</p>
          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        </div>
        <div className="modal-ft" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !title.trim()}>
            {busy ? <><Loader2 size={15} className="spin" /> Sending…</> : <><Send size={15} /> Send report</>}
          </button>
        </div>
      </div>
    </div>
  );
};
