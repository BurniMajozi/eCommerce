import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

// Small confirm dialog for destructive actions (e.g. delete product). `onConfirm`
// may be async; the dialog shows a spinner and surfaces any error inline.
export const ConfirmDialog = ({ title, message, confirmLabel = 'Delete', danger = true, onConfirm, onClose }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err?.message ?? 'The action could not be completed.');
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            {danger && <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />}
            <h3>{title}</h3>
          </div>
        </div>
        <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{message}</p>
          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={confirm} disabled={busy}>
              {busy ? <><Loader2 size={16} className="spin" /> Working…</> : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
