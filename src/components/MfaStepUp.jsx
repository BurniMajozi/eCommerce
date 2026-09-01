import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { ShieldCheck, X, Loader2 } from 'lucide-react';

// Contextual authenticator step-up. Login happens with an email code (aal1);
// when a protected write hits the backend's aal2 wall it dispatches
// 'sightlive:mfa-required', and this modal asks for the authenticator (or sets
// one up if none) to elevate the session to aal2. The user then retries.
export const MfaStepUp = () => {
  const { auth, triggerNotification } = useApp();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('loading'); // loading | challenge | enroll | done
  const [factorId, setFactorId] = useState(null);
  const [qr, setQr] = useState(null);
  const [secret, setSecret] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const init = useCallback(async () => {
    setMode('loading'); setErr(null); setCode('');
    try {
      const { data: aal } = await auth.getAAL();
      if (aal?.currentLevel === 'aal2') { setOpen(false); return; } // already elevated
      const { data: factors } = await auth.listMfaFactors();
      const verified = (factors?.totp || []).find((f) => f.status === 'verified');
      if (verified) { setFactorId(verified.id); setMode('challenge'); return; }
      // No authenticator yet — enrol one now (clear any half-finished factors first).
      for (const f of (factors?.totp || []).filter((x) => x.status !== 'verified')) {
        try { await auth.mfaUnenroll(f.id); } catch { /* ignore */ }
      }
      const { data, error } = await auth.mfaEnroll();
      if (error) { setErr(error.message || 'Could not start authenticator setup.'); setMode('challenge'); return; }
      setFactorId(data.id); setQr(data?.totp?.qr_code); setSecret(data?.totp?.secret); setMode('enroll');
    } catch (e) { setErr(e?.message || 'Could not start verification.'); setMode('challenge'); }
  }, [auth]);

  useEffect(() => {
    const handler = () => { setOpen(true); init(); };
    window.addEventListener('sightlive:mfa-required', handler);
    return () => window.removeEventListener('sightlive:mfa-required', handler);
  }, [init]);

  const verify = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const { error } = await auth.mfaChallengeVerify({ factorId, code: code.trim() });
      if (error) { setErr(error.message || 'Invalid code — try again.'); return; }
      setMode('done');
      triggerNotification('Verified', 'Authenticator confirmed — please try that action again.', 'success');
      setTimeout(() => setOpen(false), 900);
    } catch (e2) { setErr(e2?.message || 'Verification failed.'); } finally { setBusy(false); }
  };

  if (!open) return null;
  return (
    <div className="overlay" onClick={() => setOpen(false)}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ShieldCheck size={18} style={{ color: 'var(--primary)' }} /><h3>Authenticator required</h3></div>
          <button className="icon-btn" onClick={() => setOpen(false)}><X size={16} /></button>
        </div>
        <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'loading' && <div className="muted" style={{ fontSize: 13 }}>One moment…</div>}
          {mode === 'done' && <div className="badge badge-success" style={{ padding: '8px 12px' }}><ShieldCheck size={14} /> Verified</div>}
          {(mode === 'challenge' || mode === 'enroll') && (
            <form onSubmit={verify} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                {mode === 'enroll'
                  ? 'This action needs an authenticator. Scan the QR with Google Authenticator / Authy, then enter the 6-digit code.'
                  : 'This action is protected. Enter the current 6-digit code from your authenticator app.'}
              </p>
              {mode === 'enroll' && qr && <div style={{ background: '#fff', borderRadius: 10, padding: 12, alignSelf: 'center' }}><img src={qr} alt="2FA QR code" style={{ width: 160, height: 160, display: 'block' }} /></div>}
              {mode === 'enroll' && secret && <div className="muted" style={{ fontSize: 11.5, textAlign: 'center', wordBreak: 'break-all' }}>Or enter manually: <span className="tabular" style={{ color: 'var(--text)' }}>{secret}</span></div>}
              <input className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" autoFocus required
                style={{ letterSpacing: '0.3em', fontSize: 18, textAlign: 'center' }} />
              {err && <div className="badge badge-danger" style={{ padding: '8px 10px', whiteSpace: 'normal', textAlign: 'left' }}>{err}</div>}
              <button className="btn btn-primary btn-block" type="submit" disabled={busy || code.length < 6}>{busy ? <><Loader2 size={15} className="spin" /> Verifying…</> : 'Verify'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
