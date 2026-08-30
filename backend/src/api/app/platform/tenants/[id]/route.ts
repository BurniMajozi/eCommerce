import type { MedusaResponse } from '@medusajs/framework/http';
import { assertCapability, ScopeError } from '../../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../../middlewares/tenant-scope';
import { getServiceClient } from '../../../../../security/supabase-scope-resolver';

// PATCH /app/platform/tenants/:id — update branding (accent / logo path), plan
// or status for any tenant. Service-role, platform.manage.
export async function PATCH(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'platform.manage');
    const id = req.params.id;
    const b = (req.body ?? {}) as { accent?: string; logoPath?: string; plan?: string; status?: string };
    const db = getServiceClient();

    const { data: tenant } = await db.from('tenants').select('id').eq('id', id).maybeSingle();
    if (!tenant) throw new ScopeError(404, 'tenant_not_found', 'Tenant not found.');

    if (b.accent !== undefined || b.logoPath !== undefined) {
      const patch: Record<string, any> = { tenant_id: id, updated_at: new Date().toISOString() };
      if (b.accent !== undefined) patch.accent_color = b.accent;
      if (b.logoPath !== undefined) patch.logo_path = b.logoPath;
      const { error } = await db.from('tenant_branding').upsert(patch, { onConflict: 'tenant_id' });
      if (error) throw new Error(error.message);
      await db.from('audit_events').insert({ tenant_id: id, actor_user_id: scope.userId, action: 'tenant.branding.updated', target_type: 'tenant', source: 'platform_owner', metadata: { accent: b.accent ?? null } }).then(() => {}, () => {});
    }

    if (b.plan !== undefined || b.status !== undefined) {
      const patch: Record<string, any> = {};
      if (b.plan !== undefined) patch.plan_key = b.plan;
      if (b.status !== undefined) {
        const allowed = ['setup', 'active', 'suspended', 'closed'];
        if (!allowed.includes(b.status)) throw new ScopeError(400, 'invalid_status', `Status must be one of: ${allowed.join(', ')}.`);
        patch.status = b.status;
      }
      const { error } = await db.from('tenants').update(patch).eq('id', id);
      if (error) throw new Error(error.message);
      // Suspension/reactivation is a distinct, security-relevant audit action.
      const action = b.status !== undefined ? 'tenant.status.updated' : 'tenant.plan.updated';
      await db.from('audit_events').insert({ tenant_id: id, actor_user_id: scope.userId, action, target_type: 'tenant', source: 'platform_owner', metadata: patch }).then(() => {}, () => {});
    }

    res.json({ id, ok: true });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'tenant_update_failed', message: (error as Error).message });
  }
}
