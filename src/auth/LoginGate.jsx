/* oxlint-disable react/only-export-components -- single-purpose gate component */
import React, { useCallback, useEffect, useState } from 'react';
import { useAuthSession } from './AuthSessionContext';

// Gates the app behind Supabase auth ONLY when Supabase is configured. In demo
// mode it renders children immediately. Commerce management (cost/profit +
// product/order writes) needs an aal2 session, so after password sign-in this
// gate either (a) challenges an existing TOTP factor, or (b) offers 2FA setup
// (enroll → scan QR → verify) for accounts with no factor. Non-privileged users
// can continue view-only.
export const LoginGate = ({ children }) => {
  const auth = useAuthSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);
  const [stage, setStage] = useState(null);       // null | 'challenge' | 'offer' | 'enroll'
  const [checked, setChecked] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [factorId, setFactorId] = useState(null);
  const [qr, setQr] = useState(null);
  const [secret, setSecret] = useState(null);

  const detect = useCallback(async () => {
    const { data: aal } = await auth.getAAL();
    const { data: factors } = await auth.listMfaFactors();
    const totps = factors?.totp || [];
    const verified = totps.find((f) => f.status === 'verified');
    if (verified && aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2') { setFactorId(verified.id); setStage('challenge'); return; }
    if (!verified && aal?.currentLevel === 'aal1') { setStage('offer'); return; }
    setStage(null);
  }, [auth]);

  useEffect(() => {
    if (auth.mode !== 'supabase' || !auth.user) { setStage(null); setChecked(true); setSkipped(false); return undefined; }
    let cancelled = false;
    setChecked(false);
    detect().finally(() => { if (!cancelled) setChecked(true); });
    return () => { cancelled = true; };
  }, [auth.user, auth.mode, detect]);

  if (auth.mode === 'demo') return children;

  const submitPassword = async (e) => {
    e.preventDefault(); setErr(null); setSubmitting(true);
    try {
      const { error } = await auth.signInWithPassword({ email: email.trim(), password });
      if (error) setErr(error.message || 'Sign-in failed.');
    } catch (e2) { setErr(e2?.message || 'Sign-in failed.'); } finally { setSubmitting(false); }
  };

  const startEnroll = async () => {
    setErr(null); setSubmitting(true);
    try {
      const { data: factors } = await auth.listMfaFactors();
      for (const f of (factors?.totp || []).filter((x) => x.status !== 'verified')) {
        try { await auth.mfaUnenroll(f.id); } catch { /* ignore */ }
      }
      const { data, error } = await auth.mfaEnroll();
      if (error) { setErr(error.message || 'Could not start 2FA setup.'); return; }
      setFactorId(data.id); setQr(data?.totp?.qr_code); setSecret(data?.totp?.secret); setStage('enroll');
    } catch (e2) { setErr(e2?.message || 'Could not start 2FA setup.'); } finally { setSubmitting(false); }
  };

  const verifyCode = async (e) => {
    e.preventDefault(); setErr(null); setSubmitting(true);
    try {
      const { error } = await auth.mfaChallengeVerify({ factorId, code: code.trim() });
      if (error) setErr(error.message || 'Invalid code — try again.');
      else { setStage(null); setCode(''); } // session is now aal2 → app renders
    } catch (e2) { setErr(e2?.message || 'Verification failed.'); } finally { setSubmitting(false); }
  };

  const shell = (title, sub, body) => (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--bg)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, boxShadow: 'var(--shadow-lg)' }}>
        <div className="card-bd" style={{ padding: 28 }}>
          <img src="/sightlive-logo.svg" alt="SightLive" style={{ height: 30 }} />
          <h2 style={{ fontSize: 19, marginTop: 18 }}>{title}</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{sub}</p>
          {body}
          <div className="eyebrow" style={{ marginTop: 16 }}>Multi-currency · cross-border ready</div>
        </div>
      </div>
    </div>
  );
  const errBox = err && <div className="badge badge-danger" style={{ padding: '8px 10px', whiteSpace: 'normal', textAlign: 'left' }}>{err}</div>;
  const codeInput = (
    <div className="field">
      <label className="field-label">Authenticator code</label>
      <input className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6}
        value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" autoFocus required
        style={{ letterSpacing: '0.3em', fontSize: 18, textAlign: 'center' }} />
    </div>
  );

  // Challenge an existing verified factor.
  if (stage === 'challenge') {
    return shell('Two-factor verification', 'Enter the 6-digit code from your authenticator app.',
      <form onSubmit={verifyCode} style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {codeInput}{errBox}
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting || code.length < 6}>{submitting ? 'Verifying…' : 'Verify & continue'}</button>
        <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={() => { auth.signOut(); setStage(null); }}>Sign in as a different user</button>
      </form>);
  }

  // Offer 2FA setup to an account with no verified factor.
  if (stage === 'offer') {
    return shell('Secure your account', 'Managing products, pricing and orders requires two-factor authentication. Set it up now, or continue with view-only access.',
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {errBox}
        <button className="btn btn-primary btn-block" onClick={startEnroll} disabled={submitting}>{submitting ? 'Starting…' : 'Set up 2-factor authentication'}</button>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => { setSkipped(true); setStage(null); }}>Continue with view-only access</button>
      </div>);
  }

  // Enrollment: show QR + secret, verify the first code.
  if (stage === 'enroll') {
    return shell('Set up two-factor authentication', 'Scan this QR code with Google Authenticator / Authy, then enter the 6-digit code to confirm.',
      <form onSubmit={verifyCode} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {qr && <div style={{ background: '#fff', borderRadius: 10, padding: 12, alignSelf: 'center' }}><img src={qr} alt="2FA QR code" style={{ width: 168, height: 168, display: 'block' }} /></div>}
        {secret && <div className="muted" style={{ fontSize: 11.5, textAlign: 'center', wordBreak: 'break-all' }}>Or enter manually: <span className="tabular" style={{ color: 'var(--text)' }}>{secret}</span></div>}
        {codeInput}{errBox}
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting || code.length < 6}>{submitting ? 'Verifying…' : 'Confirm & finish'}</button>
        <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={() => { setStage('offer'); setCode(''); setErr(null); }}>Back</button>
      </form>);
  }

  if (auth.user && (skipped || (checked && !stage))) return children;
  if (auth.user && !checked) return shell('Signing in…', 'Checking your security level…', <div className="muted" style={{ marginTop: 18, fontSize: 13 }}>One moment…</div>);

  return shell('Sign in', 'Use your SightLive account. Access is scoped to your tenant by row-level security.',
    auth.loading
      ? <div className="muted" style={{ marginTop: 22, fontSize: 13 }}>Connecting…</div>
      : (
        <form onSubmit={submitPassword} style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field"><label className="field-label">Email</label><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="field"><label className="field-label">Password</label><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          {errBox}
          <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
        </form>
      ));
};
