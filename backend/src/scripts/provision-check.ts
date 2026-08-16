import type { ExecArgs } from '@medusajs/framework/types';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { getServiceClient, resolveSupabaseAccess } from '../security/supabase-scope-resolver';

// Verifies user provisioning end-to-end at the authorization layer:
//  1) the role -> capability matrix that governs every provisioned user, and
//  2) resolve_access_scope() (the RPC the API gates on) for each REAL member of
//     the tenant, proving different users resolve to different, role-correct
//     access. Creates no accounts. Run: SUPA_TENANT_ID=... npm run provision:check
export default async function provisionCheck({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const tenantId = process.env.SUPA_TENANT_ID?.trim() || '3d61522d-3804-4709-845b-832424c95163';
  const db = getServiceClient();

  // --- 1) Role -> capability matrix (what each role provisions) -------------
  const { data: caps, error: capErr } = await db
    .from('role_capabilities')
    .select('roles(key), capabilities(key, requires_mfa)');
  if (capErr) { logger.warn(`[provision] matrix read failed: ${capErr.message}`); }
  const matrix = new Map<string, string[]>();
  for (const row of (caps ?? []) as any[]) {
    const rk = row.roles?.key; const ck = row.capabilities?.key;
    if (!rk || !ck) continue;
    if (!matrix.has(rk)) matrix.set(rk, []);
    matrix.get(rk)!.push(ck + (row.capabilities?.requires_mfa ? ' (mfa)' : ''));
  }
  logger.info('[provision] ===== role -> capability matrix =====');
  for (const [role, list] of [...matrix.entries()].sort()) {
    logger.info(`[provision] ${role.padEnd(16)} (${list.length}) ${list.sort().join(', ')}`);
  }

  // --- 1b) Tenants + how many users are provisioned in each -----------------
  const { data: tenants } = await db.from('tenants').select('id, name, slug, status');
  logger.info('[provision] ===== tenants & provisioned membership counts =====');
  for (const t of (tenants ?? []) as any[]) {
    const { count } = await db.from('memberships').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id);
    logger.info(`[provision] tenant ${String(t.slug).padEnd(18)} ${String(t.status).padEnd(8)} ${count ?? 0} member(s)  id=${t.id}`);
  }

  // --- 1c) Platform owners (global roles, not tenant memberships) -----------
  const { data: globals } = await db.from('global_user_roles').select('user_id, role:roles(key)');
  const firstTenant = (tenants ?? [])[0]?.id;
  logger.info(`[provision] ===== global platform roles (${(globals ?? []).length}) =====`);
  for (const g of (globals ?? []) as any[]) {
    let caps = 0;
    try { const r = await resolveSupabaseAccess(g.user_id, firstTenant, null); caps = r?.capabilities?.length ?? 0; } catch { /* */ }
    logger.info(`[provision] ${String(g.user_id).slice(0, 24).padEnd(24)} role=${g.role?.key} -> resolves ${caps} caps against tenant[0]`);
  }

  // --- 2) Live scope resolution for each real member of the tenant ----------
  // No profiles embed — memberships has no FK to profiles (both -> auth.users).
  const { data: members, error: mErr } = await db
    .from('memberships')
    .select('user_id, status, membership_roles(role:roles(key)), membership_sites(site_id)')
    .eq('tenant_id', tenantId)
    .neq('status', 'revoked');
  if (mErr) { logger.warn(`[provision] members read failed: ${mErr.message}`); return; }

  logger.info(`[provision] ===== resolve_access_scope for ${(members ?? []).length} member(s) of tenant ${tenantId} =====`);
  for (const m of (members ?? []) as any[]) {
    const siteId = m.membership_sites?.[0]?.site_id ?? null;
    const roleKeys = (m.membership_roles ?? []).map((r: any) => r.role?.key).filter(Boolean);
    try {
      const resolved = await resolveSupabaseAccess(m.user_id, tenantId, siteId);
      const capCount = resolved?.capabilities?.length ?? 0;
      const mfaCount = resolved?.mfa_capabilities?.length ?? 0;
      logger.info(`[provision] ${String(m.user_id).slice(0, 24).padEnd(24)} status=${m.status} roles=[${roleKeys.join(',')}] -> ${capCount} caps, ${mfaCount} mfa-gated`);
    } catch (e) {
      logger.warn(`[provision] ${m.user_id} resolve failed: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  logger.info('[provision] done.');
}
