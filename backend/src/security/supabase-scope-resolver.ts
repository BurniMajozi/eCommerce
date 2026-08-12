import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthClaims, ResolvedAccess } from './tenant-scope';

let serviceClient: SupabaseClient | undefined;
let jwks: unknown;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for tenant-scoped routes.`);
  return value;
}

function getServiceClient(): SupabaseClient {
  if (!serviceClient) {
    serviceClient = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return serviceClient;
}

export async function verifySupabaseJwt(token: string): Promise<AuthClaims> {
  // jose is ESM-only; a dynamic import keeps this file compatible with the
  // CommonJS loading path used by the Medusa CLI.
  const { createRemoteJWKSet, jwtVerify } = await import('jose');
  const supabaseUrl = required('SUPABASE_URL');
  const issuer = process.env.SUPABASE_JWT_ISSUER?.trim() || `${supabaseUrl}/auth/v1`;
  const audience = process.env.SUPABASE_JWT_AUDIENCE?.trim() || 'authenticated';
  const jwksUrl = process.env.SUPABASE_JWKS_URL?.trim() || `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
  jwks ??= createRemoteJWKSet(new URL(jwksUrl));

  const { payload } = await jwtVerify(
    token,
    jwks as Parameters<typeof jwtVerify>[1],
    { issuer, audience },
  );
  return payload as AuthClaims;
}

export async function resolveSupabaseAccess(
  userId: string,
  tenantId: string,
  siteId: string | null,
): Promise<ResolvedAccess | null> {
  const { data, error } = await getServiceClient().rpc('resolve_access_scope', {
    p_user_id: userId,
    p_tenant_id: tenantId,
    p_site_id: siteId,
  });
  if (error) throw new Error(`Supabase scope resolution failed: ${error.code ?? 'unknown'}`);
  return data as ResolvedAccess | null;
}
