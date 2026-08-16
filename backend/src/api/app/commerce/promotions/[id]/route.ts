import type { MedusaResponse } from '@medusajs/framework/http';
import { assertCapability, assertAnyCapability, ScopeError } from '../../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../../middlewares/tenant-scope';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';

// Manager-visibility capability set (no activation gate — promos are active on
// creation; managers acknowledge/comment for history).
const MANAGER_CAPS = ['ppe.approve.tier1', 'ppe.approve.tier2', 'platform.manage'];
const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
const now = () => new Date().toISOString();

// PATCH /app/commerce/promotions/:id — manager acknowledge, or merchant cancel.
export async function PATCH(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    const b = (req.body ?? {}) as Record<string, any>;
    const action = (b.action ?? 'acknowledge').toString();

    const promo = await pg(req)('product_promotions').where({ id: req.params.id, tenant_id: scope.tenantId }).first();
    if (!promo) throw new ScopeError(404, 'promo_not_found', 'Promotion not found.');

    const patch: Record<string, any> = { updated_at: now() };
    switch (action) {
      case 'acknowledge':
        // Manager records they've seen the promo (history). Non-gating.
        assertAnyCapability(scope, MANAGER_CAPS);
        patch.acknowledged_by = (b.managerName ?? scope.userId ?? 'Manager').toString().slice(0, 200);
        patch.acknowledged_at = now();
        break;
      case 'cancel':
        // Only the merchant (commerce.manage) can withdraw a promotion.
        assertCapability(scope, 'commerce.manage');
        patch.status = 'cancelled';
        break;
      default:
        throw new ScopeError(400, 'invalid_action', `Unknown action '${action}'.`);
    }

    await pg(req)('product_promotions').where({ id: req.params.id, tenant_id: scope.tenantId }).update(patch);
    const [row] = await pg(req)('product_promotions').where({ id: req.params.id, tenant_id: scope.tenantId });
    res.json({ id: req.params.id, status: row.status, acknowledgedBy: row.acknowledged_by ?? null, acknowledgedAt: row.acknowledged_at ?? null });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'promo_update_failed', message: (error as Error).message });
  }
}

// DELETE /app/commerce/promotions/:id — remove a promotion entirely.
export async function DELETE(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.manage');
    await pg(req)('product_promotions').where({ id: req.params.id, tenant_id: scope.tenantId }).del();
    res.json({ id: req.params.id, deleted: true });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'promo_delete_failed', message: (error as Error).message });
  }
}
