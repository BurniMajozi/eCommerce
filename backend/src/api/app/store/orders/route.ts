import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { assertAnyCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';

const STAFF_CAPS = ['commerce.read', 'commerce.manage', 'ppe.stock.issue', 'platform.manage'];
const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;

const toApi = (o: any) => ({
  id: o.id, reference: o.reference, status: o.status, pickupCode: o.pickup_code,
  buyerName: o.buyer_name, buyerEmail: o.buyer_email, buyerPhone: o.buyer_phone, company: o.company,
  currency: o.currency, total: Number(o.total), discount: Number(o.discount),
  lines: o.lines ?? [], lineCount: (o.lines ?? []).length,
  paidAt: o.paid_at, collectedAt: o.collected_at, createdAt: o.created_at,
});

// GET /app/store/orders — store-counter pickup queue (paid/collected first).
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, STAFF_CAPS);
    const rows = await pg(req)('store_orders')
      .where({ tenant_id: scope.tenantId })
      .whereIn('status', ['paid', 'collected'])
      .orderBy('paid_at', 'desc');
    res.json({ source: 'medusa', orders: rows.map(toApi) });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'store_orders_read_failed', message: (error as Error).message });
  }
}
