import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { updateInventoryLevelsWorkflow, updateOrderWorkflow } from '@medusajs/medusa/core-flows';
import { readCatalogueData } from '../../../../catalogue/read';
import { assertAnyCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';

const finite = (v: any): number => (typeof v === 'number' && Number.isFinite(v) ? v : (v == null || isNaN(Number(v)) ? 0 : Number(v)));
const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
const now = () => new Date().toISOString();

async function receiveOrderStock(
  req: TenantScopedRequest,
  scope: NonNullable<TenantScopedRequest['tenantScope']>,
  lines: any[]
): Promise<{ updated: number; skipped: number; located: boolean }> {
  let updated = 0, skipped = 0;
  const data = await readCatalogueData(req, scope, false);
  const locationId = data.context.stockLocationId;
  if (!locationId) return { updated: 0, skipped: lines.length, located: false };

  const itemBySku = new Map<string, { itemId: string; required: number }>();
  const itemByProduct = new Map<string, { itemId: string; required: number }>();

  for (const p of data.products) {
    for (const v of p.variants ?? []) {
      const link = (v.inventory_items ?? [])[0];
      if (link?.inventory_item_id) {
        const itemInfo = { itemId: link.inventory_item_id, required: Math.max(1, finite(link.required_quantity) || 1) };
        if (v.sku) itemBySku.set(v.sku.toLowerCase(), itemInfo);
        if (p.id) itemByProduct.set(p.id, itemInfo);
      }
    }
  }

  const stockedByItem = new Map<string, number>();
  for (const lvl of data.inventoryLevels) {
    if (lvl.inventory_item_id && lvl.location_id === locationId) {
      stockedByItem.set(lvl.inventory_item_id, finite(lvl.stocked_quantity));
    }
  }

  const updates: Array<{ inventory_item_id: string; location_id: string; stocked_quantity: number }> = [];
  for (const l of lines) {
    const skuKey = (l.sku ?? '').toString().toLowerCase();
    const map = (l.sku && itemBySku.get(skuKey)) || (l.product_id && itemByProduct.get(l.product_id)) || (l.variant_id && itemByProduct.get(l.variant_id));
    if (!map) { skipped++; continue; }
    const current = stockedByItem.get(map.itemId) ?? 0;
    const qtyToAdd = finite(l.qty ?? l.quantity ?? 1);
    updates.push({
      inventory_item_id: map.itemId,
      location_id: locationId,
      stocked_quantity: current + qtyToAdd * map.required
    });
    updated++;
  }

  if (updates.length) {
    await updateInventoryLevelsWorkflow(req.scope).run({
      input: { updates } as Parameters<typeof updateInventoryLevelsWorkflow>[0] extends never ? never : any
    });
  }
  return { updated, skipped, located: true };
}

// PATCH /app/orders/:id — update order status, receive stock into inventory, or approve internal orders.
export async function PATCH(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, ['commerce.manage', 'ppe.approve.tier1', 'ppe.approve.tier2', 'platform.manage']);

    const orderId = req.params.id;
    const b = (req.body ?? {}) as Record<string, any>;
    const action = (b.action ?? 'status').toString();
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

    const { data: orders } = await query.graph({
      entity: 'order',
      fields: ['id', 'display_id', 'status', 'metadata', 'items.title', 'items.quantity', 'items.unit_price', 'items.variant_sku'],
      filters: { id: orderId },
    } as Parameters<typeof query.graph>[0]);

    const order = (orders ?? [])[0];
    if (!order) throw new ScopeError(404, 'order_not_found', 'Order not found.');

    const meta = ((order.metadata ?? {}) as Record<string, any>);
    const lines = (meta.items && Array.isArray(meta.items) && meta.items.length > 0)
      ? meta.items
      : (order.items ?? []).map((i: any) => ({ sku: i.variant_sku, name: i.title, qty: i.quantity, unit_price: i.unit_price }));

    const updatedMeta: Record<string, any> = { ...meta, updated_at: now() };
    let stockResult: { updated: number; skipped: number; located: boolean } | null = null;

    if (action === 'receive') {
      stockResult = await receiveOrderStock(req, scope, lines);
      updatedMeta.status = 'received';
      updatedMeta.received_at = now();
      updatedMeta.received_by = (b.receivedBy ?? scope.userId ?? 'Storekeeper').toString();
    } else if (action === 'approve') {
      updatedMeta.status = 'approved';
      updatedMeta.approved_at = now();
      updatedMeta.approved_by = (b.approverName ?? scope.userId ?? 'Mine Manager').toString();
    } else if (action === 'reject') {
      updatedMeta.status = 'rejected';
      updatedMeta.rejection_reason = (b.reason ?? 'Rejected').toString();
    } else if (b.status) {
      updatedMeta.status = b.status.toString();
    }

    try {
      await updateOrderWorkflow(req.scope).run({
        input: {
          id: orderId,
          metadata: updatedMeta,
        } as any,
      });
    } catch {
      // ignore
    }

    // Direct Postgres update for resilient order metadata persistence
    try {
      const db = pg(req);
      await db('order').where({ id: orderId }).update({
        metadata: updatedMeta,
        updated_at: new Date()
      });

      // Also update any matching row in purchase_orders table
      const displayId = order.display_id ? `#${order.display_id}` : orderId;
      await db('purchase_orders')
        .where({ tenant_id: scope.tenantId })
        .andWhere((builder: any) => {
          builder.where('reference', 'like', `%${displayId}%`).orWhere('reference', 'like', `%${orderId.slice(0, 8)}%`);
        })
        .update({
          status: updatedMeta.status,
          updated_at: new Date(),
          ...(action === 'receive' ? { received_at: new Date() } : {}),
          ...(action === 'approve' ? { approved_at: new Date(), approved_by: updatedMeta.approved_by } : {}),
        });
    } catch {
      // ignore db error
    }

    res.json({
      success: true,
      id: orderId,
      status: updatedMeta.status,
      stock: stockResult,
    });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'order_action_failed', message: (error as Error).message });
  }
}
