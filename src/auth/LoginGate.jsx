/* oxlint-disable react/only-export-components -- single-purpose gate component */
import React, { useCallback, useEffect, useState } from 'react';
import { useAuthSession } from './AuthSessionContext';
import { LandingPage } from '../components/LandingPage';
import { readBrandCache } from '../theme/applyBrand';
import { loginEmailStatus, markLoginBootstrapped } from '../catalogue/catalogueClient';

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
  const [showLogin, setShowLogin] = useState(false); // false = show marketing landing first
  const [loginStep, setLoginStep] = useState('email'); // 'email' | 'password' | 'code' | 'pwFallback'
  const [firstLogin, setFirstLogin] = useState(false);
  const [factorId, setFactorId] = useState(null);
  const [qr, setQr] = useState(null);
  const [secret, setSecret] = useState(null);
  const checkedUserIdRef = React.useRef(null);

  // Login no longer forces the authenticator. Email-code (or password) sign-in
  // completes at aal1 and the app renders; the authenticator is requested only
  // when a protected action needs it (contextual step-up via MfaStepUp).
  const detect = useCallback(async () => { setStage(null); }, []);

  useEffect(() => {
    if (auth.mode !== 'supabase' || !auth.user) {
      setStage(null);
      setChecked(true);
      setSkipped(false);
      checkedUserIdRef.current = null;
      return undefined;
    }
    // Prevent unmounting and re-logging on site changes if user is already checked
    if (checkedUserIdRef.current === auth.user.id) {
      setChecked(true);
      return undefined;
    }
    let cancelled = false;
    detect().finally(() => {
      if (!cancelled) {
        checkedUserIdRef.current = auth.user.id;
        setChecked(true);
      }
    });
    return () => { cancelled = true; };
  }, [auth.user?.id, auth.mode, detect]);

  if (auth.mode === 'demo') return children;

  const submitPassword = async (e) => {
    e.preventDefault(); setErr(null); setSubmitting(true);
    try {
      const { error } = await auth.signInWithPassword({ email: email.trim(), password });
      if (error) setErr(error.message || 'Sign-in failed.');
    } catch (e2) { setErr(e2?.message || 'Sign-in failed.'); } finally { setSubmitting(false); }
  };

  // Email-first journey. Step 1: email → decide password (first login) vs code.
  const continueEmail = async (e) => {
    e.preventDefault(); setErr(null); setSubmitting(true);
    try {
      const { needsPassword } = await loginEmailStatus(email.trim().toLowerCase());
      if (needsPassword) { setFirstLogin(true); setLoginStep('password'); }
      else if (await sendCode()) setLoginStep('code');
    } catch (e2) { setErr(e2?.message || 'Could not continue.'); } finally { setSubmitting(false); }
  };
  const sendCode = async () => {
    const { error } = await auth.signInWithEmailOtp(email.trim());
    if (error) {
      const m = error.message || '';
      setErr(/rate limit/i.test(m)
        ? 'Too many code requests — please wait a minute and try again.'
        : (m || 'Could not send the code.'));
      return false;
    }
    setCode(''); return true;
  };
  // First sign-in: verify the one-time password, then email the code. We discard
  // the password session immediately so the emailed code is the actual sign-in —
  // otherwise the password alone would log the user in and skip the code.
  const submitFirstPassword = async (e) => {
    e.preventDefault(); setErr(null); setSubmitting(true);
    try {
      const { error } = await auth.signInWithPassword({ email: email.trim(), password });
      if (error) { setErr(error.message || 'Sign-in failed.'); return; }
      await auth.signOut();
      // sendCode surfaces the real reason on failure (e.g. rate limit); if it
      // can't send, fall back to password so the user isn't stranded.
      setLoginStep((await sendCode()) ? 'code' : 'pwFallback');
    } catch (e2) { setErr(e2?.message || 'Sign-in failed.'); } finally { setSubmitting(false); }
  };
  const submitCode = async (e) => {
    e.preventDefault(); setErr(null); setSubmitting(true);
    try {
      const { data, error } = await auth.verifyEmailOtp({ email: email.trim(), token: code.trim() });
      if (error) { setErr(error.message || 'Invalid or expired code — try again.'); return; }
      if (firstLogin) await markLoginBootstrapped(data?.session?.access_token); // remember: code-only next time
      // success → onAuthStateChange sets the session and the gate proceeds
    } catch (e2) { setErr(e2?.message || 'Verification failed.'); } finally { setSubmitting(false); }
  };
  const resetLogin = () => { setLoginStep('email'); setFirstLogin(false); setCode(''); setPassword(''); setErr(null); };

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

  // Brand the login screen from the tenant remembered on this device (the accent
  // is already applied to the CSS vars at boot; here we swap the logo + name).
  const brand = readBrandCache();
  const shell = (title, sub, body) => (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--bg)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, boxShadow: 'var(--shadow-lg)' }}>
        <div className="card-bd" style={{ padding: 28 }}>
          {brand?.logoUrl
            ? <img src={brand.logoUrl} alt={brand.tenantName || 'Tenant'} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/sightlive-logo.svg'; }} style={{ height: 34, maxWidth: 200, objectFit: 'contain' }} />
            : <img src="/sightlive-logo.svg" alt="SightLive" style={{ height: 30 }} />}
          {brand?.tenantName && <div className="eyebrow" style={{ marginTop: 8, color: 'var(--primary)' }}>{brand.tenantName}</div>}
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

  // Marketing front page first; the Sign in / Get started buttons reveal the form.
  if (!showLogin) return <LandingPage onSignIn={() => setShowLogin(true)} />;

  if (auth.loading) return shell('Sign in', 'Use your SightLive account.', <div className="muted" style={{ marginTop: 22, fontSize: 13 }}>Connecting…</div>);

  // Password fallback — always reachable so a missing email code never locks
  // anyone out. Signs straight in with email + password (TOTP step-up still applies).
  if (loginStep === 'pwFallback') {
    return shell('Sign in with password', 'Use your email and password — a fallback if an email code doesn’t arrive.',
      <form onSubmit={submitPassword} style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="field"><label className="field-label">Email</label><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="field"><label className="field-label">Password</label><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {errBox}
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={resetLogin}>← Back</button>
      </form>);
  }

  // First sign-in: one-time password, then we email a code.
  if (loginStep === 'password') {
    return shell('First sign-in', <>Enter the password for <strong>{email}</strong> to set up your account. After this, you’ll sign in with just an email code.</>,
      <form onSubmit={submitFirstPassword} style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="field"><label className="field-label">Password</label><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required /></div>
        {errBox}
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting || !password}>{submitting ? 'Checking…' : 'Continue'}</button>
        <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={resetLogin}>← Use a different email</button>
      </form>);
  }

  // Emailed code step (both first sign-in and returning users).
  if (loginStep === 'code') {
    return shell('Enter your email code', <>We emailed a 6-digit code to <strong>{email}</strong>. It expires shortly.</>,
      <form onSubmit={submitCode} style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="field">
          <label className="field-label">Email code</label>
          <input className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" autoFocus required
            style={{ letterSpacing: '0.3em', fontSize: 18, textAlign: 'center' }} />
        </div>
        {errBox}
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting || code.length < 6}>{submitting ? 'Verifying…' : 'Verify & sign in'}</button>
        <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={sendCode} disabled={submitting}>Resend code</button>
        <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={() => { setLoginStep('pwFallback'); setErr(null); }}>Didn’t get a code? Sign in with password</button>
        <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={resetLogin}>← Start over</button>
      </form>);
  }

  // Default: email-first. New users get a one-time password step; returning users
  // go straight to an emailed code.
  return shell('Sign in', 'Enter your email to continue. New users sign in with a password once — after that it’s just an emailed code.',
    <form onSubmit={continueEmail} style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="field"><label className="field-label">Email</label><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.co.za" autoFocus required /></div>
      {errBox}
      <button className="btn btn-primary btn-block" type="submit" disabled={submitting || !email.trim()}>{submitting ? 'Checking…' : 'Continue'}</button>
      <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={() => { setLoginStep('pwFallback'); setErr(null); }}>Sign in with password instead</button>
      <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={() => setShowLogin(false)}>← Back to home</button>
    </form>);
};
