import React from 'react';
import { AlertTriangle, RefreshCw, Inbox, WifiOff, Loader2 } from 'lucide-react';

// Reusable in-panel state banners so failures show up visually in the view
// (not only as a toast that disappears). Use InlineError for load failures,
// InlineEmpty for no-data, InlineLoading for the first load.

export const InlineError = ({ error, onRetry, title = 'Couldn’t load this data' }) => {
  if (!error) return null;
  const msg = typeof error === 'string' ? error : (error?.message || 'Something went wrong.');
  const offline = /reached|network|fetch|Failed to fetch/i.test(msg);
  return (
    <div className="card" style={{ borderColor: 'var(--danger)', background: 'var(--danger-weak, var(--surface))' }}>
      <div className="card-bd" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 16 }}>
        {offline ? <WifiOff size={20} style={{ color: 'var(--danger)', flex: 'none', marginTop: 1 }} /> : <AlertTriangle size={20} style={{ color: 'var(--danger)', flex: 'none', marginTop: 1 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650, fontSize: 14, color: 'var(--danger)' }}>{title}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 3, wordBreak: 'break-word' }}>{msg}</div>
        </div>
        {onRetry && (
          <button className="btn btn-secondary btn-sm" onClick={onRetry} style={{ flex: 'none' }}><RefreshCw size={14} /> Retry</button>
        )}
      </div>
    </div>
  );
};

export const InlineEmpty = ({ icon: Icon = Inbox, title = 'Nothing here yet', message, action }) => (
  <div className="card"><div className="card-bd" style={{ textAlign: 'center', padding: '34px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
    <Icon size={30} style={{ color: 'var(--text-subtle)' }} />
    <div style={{ fontWeight: 600, fontSize: 15 }}>{title}</div>
    {message && <div className="muted" style={{ fontSize: 13, maxWidth: 380 }}>{message}</div>}
    {action}
  </div></div>
);

export const InlineLoading = ({ label = 'Loading…' }) => (
  <div className="card"><div className="card-bd" style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
    <Loader2 size={16} className="spin" /> {label}
  </div></div>
);
