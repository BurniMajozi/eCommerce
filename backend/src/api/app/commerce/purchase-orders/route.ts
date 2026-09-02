import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { randomUUID } from 'crypto';
import { assertCapability, assertAnyCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';

type Line = { product_id?: string | null; sku?: string | null; name?: string; qty?: number; unit_cost?: number };
const num = (v: any): number => (v == null || v === '' || isNaN(Number(v)) ? 0 : Number(v));

function normaliseLines(raw: any): Line[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => ({ product_id: l.productId || l.product_id || null, sku: l.sku || null, name: l.name || l.sku || 'Item', qty: Math.max(0, Math.floor(num(l.qty))), unit_cost: num(l.unitCost ?? l.unit_cost) }))
    .filter((l) => (l.qty ?? 0) > 0);
}

const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;

const toApi = (po: any) => ({
  id: po.id,
  supplierId: po.supplier_id,
  supplier: po.supplier_name,
  status: po.status,
  currency: po.currency,
  reference: po.reference,
  expectedDate: po.expected_date,
  lines: po.lines ?? [],
  lineCount: (po.lines ?? []).length,
  total: num(po.total),
  submittedAt: po.submitted_at,
  approvedBy: po.approved_by,
  approvedAt: po.approved_at,
  approvalSignature: po.approval_signature,
  rejectionReason: po.rejection_reason,
  sentAt: po.sent_at,
  sentTo: po.sent_to,
  receivedAt: po.received_at,
  receivedLines: po.received_lines ?? null,
  qualityNote: po.quality_note ?? null,
  createdAt: po.created_at,
});

// GET /app/commerce/purchase-orders — list the tenant's POs, newest first.
// Readable by buyers (commerce.read), approvers (ppe.approve.*) and reporting
// roles so the manager approvals screen can list pending POs.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, ['commerce.read', 'commerce.manage', 'ppe.approve.tier1', 'ppe.approve.tier2', 'reports.read', 'platform.manage']);
    const rows = await pg(req)('purchase_orders').where({ tenant_id: scope.tenantId }).orderBy('created_at', 'desc');
    res.json({ source: 'medusa', orders: rows.map(toApi) });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'po_read_failed', message: (error as Error).message });
  }
}

// POST /app/commerce/purchase-orders — create a draft PO to a supplier.
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.manage');
    const b = (req.body ?? {}) as Record<string, any>;
    const lines = normaliseLines(b.lines);
    if (!lines.length) throw new ScopeError(400, 'invalid_lines', 'At least one line item with a quantity is required.');

    let supplierName = (b.supplierName ?? '').toString().trim();
    const supplierId = (b.supplierId ?? '').toString().trim() || null;
    if (!supplierName && supplierId) {
      try {
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        const { data } = await query.graph({ entity: 'customer', fields: ['id', 'company_name', 'email'], filters: { id: supplierId } } as Parameters<typeof query.graph>[0]);
        const c = (data ?? [])[0];
        supplierName = c?.company_name || c?.email || 'Supplier';
      } catch { supplierName = 'Supplier'; }
    }
    if (!supplierName) throw new ScopeError(400, 'invalid_supplier', 'A supplier is required.');

    const isMinePlant = /mine|plant|shaft|kumba|kolomela|tenke|sishen|amandelbult|thabazimbi/i.test(supplierName);
    const initialStatus = isMinePlant ? 'pending_approval' : 'sent';
    const total = lines.reduce((a, l) => a + (l.qty ?? 0) * (l.unit_cost ?? 0), 0);
    const id = randomUUID();
    await pg(req)('purchase_orders').insert({
      id,
      tenant_id: scope.tenantId,
      supplier_id: supplierId,
      supplier_name: supplierName,
      status: initialStatus,
      currency: (b.currency || 'ZAR').toString(),
      reference: (b.reference ?? '').toString().trim() || null,
      expected_date: b.expectedDate || null,
      lines: JSON.stringify(lines),
      total,
      created_by: scope.userId,
      ...(isMinePlant ? { submitted_at: new Date() } : { sent_at: new Date(), approved_by: 'B2B Auto-Dispatch (External Vendor)', approved_at: new Date() }),
    });
    res.status(201).json({ id, supplier: supplierName, total, status: initialStatus, lineCount: lines.length });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'po_create_failed', message: (error as Error).message });
  }
}
