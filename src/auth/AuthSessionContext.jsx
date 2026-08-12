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
    signOut: () => supabase?.auth.signOut() ?? Promise.resolve(),
  }), [session, loading, error]);

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
};

export const useAuthSession = () => {
  const value = useContext(AuthSessionContext);
  if (!value) throw new Error('useAuthSession must be used within AuthSessionProvider.');
  return value;
};
