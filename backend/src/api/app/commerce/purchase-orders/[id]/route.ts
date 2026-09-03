import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { updateInventoryLevelsWorkflow } from '@medusajs/medusa/core-flows';
import { readCatalogueData } from '../../../../../catalogue/read';
import { assertCapability, assertAnyCapability, ScopeError } from '../../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../../middlewares/tenant-scope';
import { getServiceClient } from '../../../../../security/supabase-scope-resolver';
import { sendEmailAsync } from '../../../../../lib/agentmail';
import { poDecisionEmail } from '../../../../../lib/email-templates';
import { applyQualityReturns, buildReceivedLines, PurchaseOrderQuantityError } from '../../../../../commerce/purchase-order-quantities';

const finite = (v: any): number => (typeof v === 'number' && Number.isFinite(v) ? v : (v == null || isNaN(Number(v)) ? 0 : Number(v)));
// Separation of duties: the buyer (commerce.manage) submits; a manager
// (ppe.approve.*) or platform owner approves & signs — a merchant cannot
// approve their own PO.
const APPROVE_CAPS = ['ppe.approve.tier1', 'ppe.approve.tier2', 'platform.manage'];
const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
const now = () => new Date().toISOString();

// Applies signed stock deltas after validating that every PO line resolves to
// the active tenant/site inventory. Positive qty receives; negative qty reverses
// stock for a quality return.
async function adjustStock(req: TenantScopedRequest, scope: NonNullable<TenantScopedRequest['tenantScope']>, lines: any[]): Promise<{ updated: number; skipped: number; located: boolean }> {
  if (!lines.length) return { updated: 0, skipped: 0, located: true };
  const data = await readCatalogueData(req, scope, false);
  const locationId = data.context.stockLocationId;
  if (!locationId) throw new ScopeError(409, 'stock_location_missing', 'The active site has no stock location.');

  const itemBySku = new Map<string, { itemId: string; required: number }>();
  const itemById = new Map<string, { itemId: string; required: number }>();

  for (const p of data.products) {
    for (const v of p.variants ?? []) {
      const link = (v.inventory_items ?? [])[0];
      if (link?.inventory_item_id) {
        const itemInfo = { itemId: link.inventory_item_id, required: Math.max(1, finite(link.required_quantity) || 1) };
        if (v.sku) itemBySku.set(v.sku.toLowerCase(), itemInfo);
        if (v.id) itemById.set(v.id, itemInfo);
        if (p.id) itemById.set(p.id, itemInfo);
      }
    }
  }

  const stockedByItem = new Map<string, number>();
  for (const lvl of data.inventoryLevels) {
    if (lvl.inventory_item_id && lvl.location_id === locationId) stockedByItem.set(lvl.inventory_item_id, finite(lvl.stocked_quantity));
  }

  const deltaByItem = new Map<string, number>();
  for (const l of lines) {
    const skuKey = (l.sku ?? '').toString().toLowerCase();
    const map = (l.sku && itemBySku.get(skuKey)) || (l.product_id && itemById.get(l.product_id)) || (l.variant_id && itemById.get(l.variant_id));
    if (!map) throw new ScopeError(409, 'inventory_item_missing', `No active-site inventory item was found for ${l.sku ?? l.product_id ?? 'a PO line'}.`);
    deltaByItem.set(map.itemId, (deltaByItem.get(map.itemId) ?? 0) + finite(l.qty) * map.required);
  }

  const updates: Array<{ inventory_item_id: string; location_id: string; stocked_quantity: number }> = [];
  for (const [itemId, delta] of deltaByItem) {
    const current = stockedByItem.get(itemId) ?? 0;
    const next = current + delta;
    if (next < 0) throw new ScopeError(409, 'insufficient_stock_for_return', 'A quality return cannot reduce stock below zero.');
    updates.push({ inventory_item_id: itemId, location_id: locationId, stocked_quantity: next });
  }
  if (updates.length) {
    await updateInventoryLevelsWorkflow(req.scope).run({ input: { updates } as Parameters<typeof updateInventoryLevelsWorkflow>[0] extends never ? never : any });
  }
  return { updated: updates.length, skipped: 0, located: true };
}

// PATCH /app/commerce/purchase-orders/:id — drive the approval workflow via an
// `action`: submit → approve|reject → send → receive. Separation of duties:
// buyers (commerce.manage) submit/send/receive; approvers (ppe.approve.*) sign.
export async function PATCH(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    const b = (req.body ?? {}) as Record<string, any>;
    const action = (b.action ?? 'edit').toString();
    const db = pg(req);

    const po = await db('purchase_orders').where({ id: req.params.id, tenant_id: scope.tenantId }).first();
    if (!po) throw new ScopeError(404, 'po_not_found', 'Purchase order not found.');

    const patch: Record<string, any> = { updated_at: now() };
    let stockResult: { updated: number; skipped: number; located: boolean } | null = null;
    const expect = (...states: string[]) => { if (!states.includes(po.status)) throw new ScopeError(409, 'invalid_transition', `A '${action}' action is not allowed from status '${po.status}'.`); };
    // Regular POs need an approver (ppe.approve.* / platform.manage). Replenishment
    // POs are system-generated (not raised by a person), so the merchant/buyer
    // (commerce.manage) may approve them from their approval queue.
    const assertCanDecide = () => assertAnyCapability(scope, po.origin === 'replenishment' ? [...APPROVE_CAPS, 'commerce.manage'] : APPROVE_CAPS);

    switch (action) {
      case 'edit':
        assertCapability(scope, 'commerce.manage');
        if (b.reference !== undefined) patch.reference = (b.reference ?? '').toString().trim() || null;
        if (b.expectedDate !== undefined) patch.expected_date = b.expectedDate || null;
        break;
      case 'submit':
        assertCapability(scope, 'commerce.manage');
        expect('draft', 'rejected');
        patch.status = 'pending_approval'; patch.submitted_at = now();
        patch.rejection_reason = null;
        break;
      case 'approve':
        assertCanDecide();
        expect('pending_approval');
        patch.status = 'approved';
        patch.approved_by = (b.approverName ?? scope.userId ?? 'Approver').toString().slice(0, 200);
        patch.approved_at = now();
        patch.approval_signature = (b.signature ?? '').toString().slice(0, 300000) || null;
        break;
      case 'reject':
        assertCanDecide();
        expect('pending_approval');
        patch.status = 'rejected';
        patch.rejection_reason = (b.reason ?? '').toString().slice(0, 1000) || 'Rejected';
        break;
      case 'send':
        assertCapability(scope, 'commerce.manage');
        expect('approved', 'sent');
        patch.status = 'sent'; patch.sent_at = now();
        if (b.email) patch.sent_to = String(b.email).slice(0, 320);
        break;
      case 'receive': {
        assertCapability(scope, 'commerce.manage');
        expect('approved', 'sent');
        const ordered = (po.lines ?? []) as any[];
        const movement = buildReceivedLines(ordered, b.receivedLines, b.damagedLines);
        stockResult = await adjustStock(req, scope, movement.stockAdjustments);
        patch.status = 'received'; patch.received_at = now();
        patch.received_lines = JSON.stringify(movement.receivedLines);
        break;
      }
      case 'report_quality': {
        // Quality returns are absolute per-line totals. The delta from the last
        // report is applied to stock so the scorecard and inventory stay aligned.
        assertCapability(scope, 'commerce.manage');
        expect('received');
        const existing = (typeof po.received_lines === 'string' ? JSON.parse(po.received_lines) : (po.received_lines ?? [])) as any[];
        const base = existing.length ? existing : (po.lines ?? []).map((l: any) => ({ sku: l.sku, name: l.name, ordered: Math.floor(Number(l.qty ?? 0)), received: Math.floor(Number(l.qty ?? 0)), damaged: 0, returned: 0, unitCost: Number(l.unit_cost ?? 0) }));
        const quality = applyQualityReturns(base, b.returnedLines);
        stockResult = await adjustStock(req, scope, quality.stockAdjustments);
        patch.received_lines = JSON.stringify(quality.receivedLines);
        patch.quality_note = (b.note ?? '').toString().slice(0, 1000) || po.quality_note || null;
        break;
      }
      case 'cancel':
        assertCapability(scope, 'commerce.manage');
        if (po.status === 'received') throw new ScopeError(409, 'invalid_transition', 'A received PO cannot be cancelled.');
        patch.status = 'cancelled';
        break;
      default:
        throw new ScopeError(400, 'invalid_action', `Unknown action '${action}'.`);
    }

    await db('purchase_orders').where({ id: req.params.id, tenant_id: scope.tenantId }).update(patch);

    // Approvals email: notify the buyer who raised the PO of the decision.
    // Recipient is resolved server-side from created_by; best-effort, never blocks.
    if ((action === 'approve' || action === 'reject') && po.created_by) {
      try {
        const { data } = await getServiceClient().auth.admin.getUserById(String(po.created_by));
        const email = data?.user?.email;
        if (email) {
          const { subject, html, text } = poDecisionEmail({
            reference: po.reference, decision: action === 'approve' ? 'approved' : 'rejected',
            supplier: po.supplier_name, approver: patch.approved_by, reason: patch.rejection_reason,
            total: Number(po.total), currency: po.currency,
          });
          sendEmailAsync({ to: email, subject, html, text, labels: ['po_decision'] }, `po ${action}`);
        }
      } catch { /* email is best-effort */ }
    }

    res.json({ id: req.params.id, status: patch.status ?? po.status, stock: stockResult });
  } catch (error) {
    if (error instanceof PurchaseOrderQuantityError) {
      res.status(400).json({ code: error.code, message: error.message });
      return;
    }
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
