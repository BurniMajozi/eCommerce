/* oxlint-disable react/only-export-components -- single-purpose gate component */
import React, { useCallback, useEffect, useState } from 'react';
import { useAuthSession } from './AuthSessionContext';

// Gates the app behind Supabase auth ONLY when Supabase is configured. In demo
// mode (no VITE_SUPABASE_* set) it renders children immediately, so the mock
// experience is unchanged. When the signed-in account has an enrolled TOTP
// factor, the session is aal1 until the 6-digit code is verified — required for
// commerce.manage (cost/profit + product/order writes). This gate performs that
// step-up before letting the app render.
export const LoginGate = ({ children }) => {
  const auth = useAuthSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);
  const [mfa, setMfa] = useState(null);          // { factorId } when a code is required
  const [mfaChecked, setMfaChecked] = useState(false);

  const detectMfa = useCallback(async () => {
    const { data: aal } = await auth.getAAL();
    if (aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2') {
      const { data: factors } = await auth.listMfaFactors();
      const totp = (factors?.totp || []).find((f) => f.status === 'verified') || (factors?.totp || [])[0];
      if (totp) { setMfa({ factorId: totp.id }); return; }
    }
    setMfa(null);
  }, [auth]);

  // Whenever a Supabase session appears, check whether it needs an MFA step-up
  // before we let the app render (prevents an aal1 flash into the app).
  useEffect(() => {
    if (auth.mode !== 'supabase' || !auth.user) { setMfa(null); setMfaChecked(true); return undefined; }
    let cancelled = false;
    setMfaChecked(false);
    detectMfa().finally(() => { if (!cancelled) setMfaChecked(true); });
    return () => { cancelled = true; };
  }, [auth.user, auth.mode, detectMfa]);

  if (auth.mode === 'demo') return children;

  const submitPassword = async (e) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const { error } = await auth.signInWithPassword({ email: email.trim(), password });
      if (error) setErr(error.message || 'Sign-in failed.');
      // MFA detection runs via the effect once the session updates.
    } catch (e2) {
      setErr(e2?.message || 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const { error } = await auth.mfaChallengeVerify({ factorId: mfa.factorId, code: code.trim() });
      if (error) { setErr(error.message || 'Invalid code — try again.'); }
      else { setMfa(null); setCode(''); } // session is now aal2 → app renders
    } catch (e2) {
      setErr(e2?.message || 'Verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (title, sub, body) => (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--bg)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 380, boxShadow: 'var(--shadow-lg)' }}>
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

  // Step 2: MFA code required (signed in but aal1 with an enrolled factor).
  if (mfa) {
    return shell(
      'Two-factor verification',
      'Enter the 6-digit code from your authenticator app to finish signing in.',
      <form onSubmit={submitCode} style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="field">
          <label className="field-label">Authenticator code</label>
          <input className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" autoFocus required
            style={{ letterSpacing: '0.3em', fontSize: 18, textAlign: 'center' }} />
        </div>
        {errBox}
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting || code.length < 6}>{submitting ? 'Verifying…' : 'Verify & continue'}</button>
        <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={() => { auth.signOut(); setMfa(null); }}>Sign in as a different user</button>
      </form>,
    );
  }

  // Signed in and checked (aal2, or no MFA factor) → render the app.
  if (auth.user && mfaChecked) return children;

  // Signed in but still verifying the security level → brief hold (no aal1 flash).
  if (auth.user && !mfaChecked) return shell('Signing in…', 'Checking your security level…', <div className="muted" style={{ marginTop: 18, fontSize: 13 }}>One moment…</div>);

  // Step 1: email + password.
  return shell(
    'Sign in',
    'Use your SightLive account. Access is scoped to your tenant by row-level security.',
    auth.loading
      ? <div className="muted" style={{ marginTop: 22, fontSize: 13 }}>Connecting…</div>
      : (
        <form onSubmit={submitPassword} style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label className="field-label">Email</label>
            <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label className="field-label">Password</label>
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {errBox}
          <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
        </form>
      ),
  );
};
