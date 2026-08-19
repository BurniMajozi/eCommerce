import type { MedusaResponse } from '@medusajs/framework/http';
import { assertCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';
import { getServiceClient } from '../../../../security/supabase-scope-resolver';

// GET /app/platform/overview — everything the Platform Owner panel reads:
// tenants (with branding + live member/site counts), the RBAC map, and recent
// audit. Served via the service role so it never depends on browser RLS.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'platform.manage');
    const db = getServiceClient();

    const [tenantsQ, membersQ, sitesQ, brandingQ, rolesQ, capsQ, rcQ, auditQ] = await Promise.all([
      db.from('tenants').select('id, name, slug, status, plan_key').order('name'),
      db.from('memberships').select('tenant_id, status'),
      db.from('sites').select('tenant_id, status'),
      db.from('tenant_branding').select('tenant_id, accent_color, logo_path'),
      db.from('roles').select('id, key, name, description, privileged').order('name'),
      db.from('capabilities').select('id, key, description, requires_mfa').order('key'),
      db.from('role_capabilities').select('role_id, capability_id'),
      db.from('audit_events').select('id, tenant_id, action, target_type, source, created_at, metadata').order('created_at', { ascending: false }).limit(25),
    ]);

    const memberCount: Record<string, number> = {};
    for (const m of membersQ.data ?? []) if (m.status === 'active') memberCount[m.tenant_id] = (memberCount[m.tenant_id] ?? 0) + 1;
    const siteCount: Record<string, number> = {};
    for (const s of sitesQ.data ?? []) siteCount[s.tenant_id] = (siteCount[s.tenant_id] ?? 0) + 1;
    const brandById: Record<string, any> = {};
    for (const b of brandingQ.data ?? []) brandById[b.tenant_id] = b;

    const tenants = (tenantsQ.data ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      domain: t.slug ? `${t.slug}.sightlive.app` : '—',
      status: t.status,
      plan: t.plan_key ?? 'trial',
      users: memberCount[t.id] ?? 0,
      sites: siteCount[t.id] ?? 0,
      branding: { accent: brandById[t.id]?.accent_color ?? '#2563EB', logoPath: brandById[t.id]?.logo_path ?? null },
    }));

    const capById = new Map((capsQ.data ?? []).map((c: any) => [c.id, c]));
    const roles = (rolesQ.data ?? []).map((r: any) => ({
      id: r.id, key: r.key, name: r.name, description: r.description, privileged: r.privileged,
      capabilities: (rcQ.data ?? []).filter((l: any) => l.role_id === r.id).map((l: any) => capById.get(l.capability_id)).filter(Boolean),
    }));

    res.json({ source: 'medusa', tenants, roles, audit: auditQ.data ?? [] });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'platform_overview_failed', message: (error as Error).message });
  }
}
