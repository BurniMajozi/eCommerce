import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

const isValidProjectUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co');
  } catch {
    return false;
  }
};

const hasPublicKeyShape = (value) => value?.startsWith('sb_publishable_') || value?.split('.').length === 3;

// Demo mode is disabled only after both browser-safe values pass structural
// validation. VITE_DEMO_MODE can explicitly force demo mode during development.
export const isSupabaseConfigured = import.meta.env.VITE_DEMO_MODE !== 'true'
  && isValidProjectUrl(supabaseUrl)
  && hasPublicKeyShape(supabasePublishableKey);

// Only the public/publishable key is valid in browser code. The service-role
// key belongs exclusively in the Medusa backend environment.
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null;
