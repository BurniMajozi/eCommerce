import type { MedusaResponse } from '@medusajs/framework/http';
import { assertCapability, ScopeError } from '../../../../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../../../../middlewares/tenant-scope';
import { getServiceClient } from '../../../../../../../security/supabase-scope-resolver';

// PATCH /app/platform/tenants/:id/sites/:siteId — rename or change a site's
// status (active / suspended / closed).
export async function PATCH(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'platform.manage', true);
    const b = (req.body ?? {}) as { name?: string; status?: string };
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (b.name !== undefined) {
      const name = b.name.toString().trim();
      if (!name) throw new ScopeError(400, 'name_required', 'Site name cannot be empty.');
      patch.name = name.slice(0, 120);
    }
    if (b.status !== undefined) {
      const allowed = ['active', 'suspended', 'closed'];
      if (!allowed.includes(b.status)) throw new ScopeError(400, 'invalid_status', `Status must be one of: ${allowed.join(', ')}.`);
      patch.status = b.status;
    }
    const db = getServiceClient();
    const { data, error } = await db.from('sites').update(patch)
      .eq('id', req.params.siteId).eq('tenant_id', req.params.id)
      .select('id, name, code, status, timezone').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new ScopeError(404, 'site_not_found', 'Site not found for this tenant.');
    res.json({ site: { id: data.id, name: data.name, code: data.code, status: data.status, timezone: data.timezone } });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'site_update_failed', message: (error as Error).message });
  }
}
