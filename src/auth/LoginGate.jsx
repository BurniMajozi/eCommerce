/* oxlint-disable react/only-export-components -- single-purpose gate component */
import React, { useState } from 'react';
import { useAuthSession } from './AuthSessionContext';

// Gates the app behind Supabase auth ONLY when Supabase is configured. In demo
// mode (no VITE_SUPABASE_* set) it renders children immediately, so the mock
// experience is unchanged.
export const LoginGate = ({ children }) => {
  const auth = useAuthSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  if (auth.mode === 'demo') return children;
  if (auth.user) return children;

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const { error } = await auth.signInWithPassword({ email: email.trim(), password });
      if (error) setErr(error.message || 'Sign-in failed.');
    } catch (e2) {
      setErr(e2?.message || 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--bg)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 380, boxShadow: 'var(--shadow-lg)' }}>
        <div className="card-bd" style={{ padding: 28 }}>
          <img src="/sightlive-logo.svg" alt="SightLive" style={{ height: 30 }} />
          <h2 style={{ fontSize: 19, marginTop: 18 }}>Sign in</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Use your SightLive account. Access is scoped to your tenant by row-level security.</p>

          {auth.loading ? (
            <div className="muted" style={{ marginTop: 22, fontSize: 13 }}>Connecting…</div>
          ) : (
            <form onSubmit={submit} style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label className="field-label">Email</label>
                <input className="input" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="field">
                <label className="field-label">Password</label>
                <input className="input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              {err && <div className="badge badge-danger" style={{ padding: '8px 10px', whiteSpace: 'normal', textAlign: 'left' }}>{err}</div>}
              <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
            </form>
          )}

          <div className="eyebrow" style={{ marginTop: 16 }}>Multi-currency · cross-border ready</div>
        </div>
      </div>
    </div>
  );
};
