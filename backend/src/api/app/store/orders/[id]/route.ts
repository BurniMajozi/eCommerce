import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { assertAnyCapability, ScopeError } from '../../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../../middlewares/tenant-scope';

const ISSUE_CAPS = ['commerce.manage', 'ppe.stock.issue', 'platform.manage'];
const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;

// PATCH /app/store/orders/:id — mark a paid store order collected at the counter
// (verifies the pickup code the buyer presents).
export async function PATCH(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, ISSUE_CAPS);
    const db = pg(req);
    const o = await db('store_orders').where({ id: req.params.id, tenant_id: scope.tenantId }).first();
    if (!o) throw new ScopeError(404, 'order_not_found', 'Order not found.');
    if (o.status !== 'paid') throw new ScopeError(409, 'not_collectable', `Only paid orders can be collected (this one is ${o.status}).`);

    const code = ((req.body as { pickupCode?: string })?.pickupCode ?? '').toString().trim().toUpperCase();
    if (code && o.pickup_code && code !== String(o.pickup_code).toUpperCase()) {
      throw new ScopeError(400, 'bad_pickup_code', 'Pickup code does not match this order.');
    }
    await db('store_orders').where({ id: o.id }).update({ status: 'collected', collected_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    res.json({ id: o.id, status: 'collected' });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'collect_failed', message: (error as Error).message });
  }
}
