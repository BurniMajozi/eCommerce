/* oxlint-disable react/only-export-components -- provider and hook intentionally share one context module */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const AuthSessionContext = createContext(null);

export const AuthSessionProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setError(sessionError ?? null);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setError(null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Auto sign-out after 3 hours of inactivity (mouse/keyboard/tab activity
  // resets the timer). A longer idle window means fewer re-logins, and each
  // re-login costs an emailed sign-in code (AgentMail tier usage), so 3h keeps
  // that spend down. On logout the session clears and the login screen returns.
  useEffect(() => {
    if (!supabase || !session) return undefined;
    const IDLE_MS = 3 * 60 * 60 * 1000;
    let timer;
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => { supabase.auth.signOut(); }, IDLE_MS); };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'visibilitychange'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(timer); events.forEach((e) => window.removeEventListener(e, reset)); };
  }, [session]);

  const value = useMemo(() => ({
    configured: isSupabaseConfigured,
    mode: isSupabaseConfigured ? 'supabase' : 'demo',
    session,
    user: session?.user ?? null,
    loading,
    error,
    signInWithPassword: (credentials) => {
      if (!supabase) throw new Error('Supabase is not configured; the app is running in demo mode.');
      return supabase.auth.signInWithPassword(credentials);
    },
    // Passwordless email-code sign-in. signInWithEmailOtp emails a 6-digit code
    // (only to existing users — shouldCreateUser:false); verifyEmailOtp exchanges
    // the code for a session. The AAL/MFA gate still applies afterwards.
    signInWithEmailOtp: (email) => {
      if (!supabase) throw new Error('Supabase is not configured; the app is running in demo mode.');
      return supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    },
    verifyEmailOtp: ({ email, token }) => {
      if (!supabase) throw new Error('Supabase is not configured.');
      return supabase.auth.verifyOtp({ email, token, type: 'email' });
    },
    // MFA step-up: after password sign-in, if the account has an enrolled TOTP
    // factor the session is aal1 until the code is verified (→ aal2). aal2 is
    // required for commerce.manage (cost/profit + product/order writes).
    getAAL: () => supabase
      ? supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      : Promise.resolve({ data: null, error: null }),
    listMfaFactors: () => supabase
      ? supabase.auth.mfa.listFactors()
      : Promise.resolve({ data: null, error: null }),
    mfaChallengeVerify: ({ factorId, code }) => {
      if (!supabase) throw new Error('Supabase is not configured.');
      return supabase.auth.mfa.challengeAndVerify({ factorId, code });
    },
    mfaEnroll: () => {
      if (!supabase) throw new Error('Supabase is not configured.');
      return supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `authenticator-${Date.now()}` });
    },
    mfaUnenroll: (factorId) => supabase
      ? supabase.auth.mfa.unenroll({ factorId })
      : Promise.resolve({ data: null, error: null }),
    signOut: () => supabase?.auth.signOut() ?? Promise.resolve(),
  }), [session, loading, error]);

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
};

export const useAuthSession = () => {
  const value = useContext(AuthSessionContext);
  if (!value) throw new Error('useAuthSession must be used within AuthSessionProvider.');
  return value;
};
