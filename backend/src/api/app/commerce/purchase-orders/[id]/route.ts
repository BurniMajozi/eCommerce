import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { updateInventoryLevelsWorkflow } from '@medusajs/medusa/core-flows';
import { readCatalogueData } from '../../../../../catalogue/read';
import { assertCapability, ScopeError } from '../../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../../middlewares/tenant-scope';

const finite = (v: any): number => (typeof v === 'number' && Number.isFinite(v) ? v : (v == null || isNaN(Number(v)) ? 0 : Number(v)));
const VALID = ['draft', 'sent', 'received', 'cancelled'];
const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;

// Receiving a PO increases on-hand stock. Resolve each line product's inventory
// item + the tenant/site stock location, then bump stocked_quantity by the
// received qty. Best-effort: returns how many lines updated.
async function receiveStock(req: TenantScopedRequest, scope: NonNullable<TenantScopedRequest['tenantScope']>, lines: any[]): Promise<{ updated: number; skipped: number; located: boolean }> {
  let updated = 0, skipped = 0;
  const data = await readCatalogueData(req, scope, false);
  const locationId = data.context.stockLocationId;
  if (!locationId) return { updated: 0, skipped: lines.length, located: false };

  const itemByProduct = new Map<string, { itemId: string; required: number }>();
  for (const p of data.products) {
    for (const v of p.variants ?? []) {
      const link = (v.inventory_items ?? [])[0];
      if (p.id && link?.inventory_item_id) { itemByProduct.set(p.id, { itemId: link.inventory_item_id, required: Math.max(1, finite(link.required_quantity) || 1) }); break; }
    }
  }
  const stockedByItem = new Map<string, number>();
  for (const lvl of data.inventoryLevels) {
    if (lvl.inventory_item_id && lvl.location_id === locationId) stockedByItem.set(lvl.inventory_item_id, finite(lvl.stocked_quantity));
  }

  const updates: Array<{ inventory_item_id: string; location_id: string; stocked_quantity: number }> = [];
  for (const l of lines) {
    const map = l.product_id ? itemByProduct.get(l.product_id) : null;
    if (!map) { skipped++; continue; }
    const current = stockedByItem.get(map.itemId) ?? 0;
    updates.push({ inventory_item_id: map.itemId, location_id: locationId, stocked_quantity: current + finite(l.qty) * map.required });
    updated++;
  }
  if (updates.length) {
    await updateInventoryLevelsWorkflow(req.scope).run({ input: { updates } as Parameters<typeof updateInventoryLevelsWorkflow>[0] extends never ? never : any });
  }
  return { updated, skipped, located: true };
}

// PATCH /app/commerce/purchase-orders/:id — change status or edit fields.
export async function PATCH(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.manage');
    const b = (req.body ?? {}) as Record<string, any>;
    const db = pg(req);

    const po = await db('purchase_orders').where({ id: req.params.id, tenant_id: scope.tenantId }).first();
    if (!po) throw new ScopeError(404, 'po_not_found', 'Purchase order not found.');

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (b.reference !== undefined) patch.reference = (b.reference ?? '').toString().trim() || null;
    if (b.expectedDate !== undefined) patch.expected_date = b.expectedDate || null;

    let stockResult: { updated: number; skipped: number; located: boolean } | null = null;
    if (b.status !== undefined) {
      const status = String(b.status);
      if (!VALID.includes(status)) throw new ScopeError(400, 'invalid_status', `Status must be one of: ${VALID.join(', ')}.`);
      patch.status = status;
      if (status === 'received' && po.status !== 'received') {
        stockResult = await receiveStock(req, scope, po.lines ?? []);
        patch.received_at = new Date().toISOString();
      }
    }

    await db('purchase_orders').where({ id: req.params.id, tenant_id: scope.tenantId }).update(patch);
    res.json({ id: req.params.id, status: patch.status ?? po.status, stock: stockResult });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'po_update_failed', message: (error as Error).message });
  }
}

// DELETE /app/commerce/purchase-orders/:id — remove a PO.
export async function DELETE(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.manage');
    await pg(req)('purchase_orders').where({ id: req.params.id, tenant_id: scope.tenantId }).del();
    res.json({ id: req.params.id, deleted: true });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'po_delete_failed', message: (error as Error).message });
  }
}
