import type { MedusaResponse } from '@medusajs/framework/http';
import { assertCapability, ScopeError } from '../../../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../../../middlewares/tenant-scope';
import { getServiceClient } from '../../../../../../security/supabase-scope-resolver';

const toApi = (s: any) => ({ id: s.id, name: s.name, code: s.code, status: s.status, timezone: s.timezone });
const slugCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 24) || 'SITE';

// GET /app/platform/tenants/:id/sites — list a tenant's sites (locations).
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'platform.manage');
    const db = getServiceClient();
    const { data, error } = await db.from('sites').select('id, name, code, status, timezone').eq('tenant_id', req.params.id).order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    res.json({ sites: (data ?? []).map(toApi) });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'sites_failed', message: (error as Error).message });
  }
}

// POST /app/platform/tenants/:id/sites — add a site (location) to a tenant.
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'platform.manage', true);
    const tenantId = req.params.id;
    const b = (req.body ?? {}) as { name?: string; code?: string; timezone?: string };
    const name = (b.name ?? '').toString().trim();
    if (!name) throw new ScopeError(400, 'name_required', 'A site name is required.');
    const code = (b.code ? slugCode(b.code.toString()) : slugCode(name));
    const db = getServiceClient();

    const { data: tenant } = await db.from('tenants').select('id').eq('id', tenantId).maybeSingle();
    if (!tenant) throw new ScopeError(404, 'tenant_not_found', 'Tenant not found.');

    const { data: site, error } = await db.from('sites')
      .insert({ tenant_id: tenantId, name: name.slice(0, 120), code, status: 'active', timezone: (b.timezone ?? 'Africa/Johannesburg').toString() })
      .select('id, name, code, status, timezone').single();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) throw new ScopeError(409, 'code_exists', `A site with code “${code}” already exists for this tenant.`);
      throw new Error(error.message);
    }
    await db.from('audit_events').insert({ tenant_id: tenantId, actor_user_id: scope.userId, action: 'site.created', target_type: 'site', source: 'platform_owner', metadata: { name, code } }).then(() => {}, () => {});
    res.status(201).json({ site: toApi(site) });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'site_create_failed', message: (error as Error).message });
  }
}
