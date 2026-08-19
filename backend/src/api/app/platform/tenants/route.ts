import type { MedusaResponse } from '@medusajs/framework/http';
import { assertCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';
import { getServiceClient } from '../../../../security/supabase-scope-resolver';

// POST /app/platform/tenants — provision a new tenant + seed its branding row.
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'platform.manage', true);
    const b = (req.body ?? {}) as { name?: string; slug?: string; plan?: string };
    const name = (b.name ?? '').toString().trim();
    if (!name) throw new ScopeError(400, 'invalid_name', 'A tenant name is required.');
    const slug = ((b.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')) || 'tenant';
    const db = getServiceClient();

    const { data: tenant, error } = await db.from('tenants')
      .insert({ name, slug, status: 'setup', plan_key: b.plan || 'trial' })
      .select('id, name, slug, status, plan_key').single();
    if (error || !tenant) throw new Error(error?.message || 'Could not create tenant.');

    await db.from('tenant_branding').upsert({ tenant_id: tenant.id, accent_color: '#F5721A' }, { onConflict: 'tenant_id' });
    await db.from('audit_events').insert({ tenant_id: tenant.id, actor_user_id: scope.userId, action: 'tenant.provisioned', target_type: 'tenant', source: 'platform_owner', metadata: { name, slug } }).then(() => {}, () => {});

    res.status(201).json({ id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status, plan: tenant.plan_key });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'tenant_provision_failed', message: (error as Error).message });
  }
}
