import type { MedusaResponse } from '@medusajs/framework/http';
import { assertCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';
import { getServiceClient } from '../../../../security/supabase-scope-resolver';

const ASSIGNABLE_ROLES = ['worker', 'storekeeper', 'supervisor', 'manager', 'executive', 'merchant', 'tenant_admin'];

// PATCH /app/members/:id — change a member's role (:id = membership id).
export async function PATCH(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'tenant.members.manage', true);
    const role = ((req.body as { role?: string })?.role ?? '').toString().trim();
    if (!ASSIGNABLE_ROLES.includes(role)) throw new ScopeError(400, 'invalid_role', `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}.`);

    const db = getServiceClient();
    // Confirm the membership belongs to this tenant.
    const { data: m } = await db.from('memberships').select('id').eq('id', req.params.id).eq('tenant_id', scope.tenantId).maybeSingle();
    if (!m) throw new ScopeError(404, 'member_not_found', 'Member not found in this tenant.');
    const { data: roleRow } = await db.from('roles').select('id').eq('key', role).single();
    if (!roleRow) throw new Error('Role not found.');

    await db.from('membership_roles').delete().eq('membership_id', req.params.id);
    await db.from('membership_roles').insert({ membership_id: req.params.id, role_id: roleRow.id });
    res.json({ membershipId: req.params.id, role });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'member_update_failed', message: (error as Error).message });
  }
}

// DELETE /app/members/:id — suspend a member (soft-remove; keeps history/audit).
export async function DELETE(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'tenant.members.manage', true);
    const db = getServiceClient();
    const { data: m } = await db.from('memberships').select('id').eq('id', req.params.id).eq('tenant_id', scope.tenantId).maybeSingle();
    if (!m) throw new ScopeError(404, 'member_not_found', 'Member not found in this tenant.');
    await db.from('memberships').update({ status: 'suspended' }).eq('id', req.params.id);
    res.json({ membershipId: req.params.id, status: 'suspended' });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'member_remove_failed', message: (error as Error).message });
  }
}
