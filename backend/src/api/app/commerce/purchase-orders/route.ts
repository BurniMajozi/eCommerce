import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { assertCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';
import { getServiceClient } from '../../../../security/supabase-scope-resolver';

type Line = { product_id?: string; sku?: string; name?: string; qty?: number; unit_cost?: number };
const num = (v: any): number => (v == null || v === '' || isNaN(Number(v)) ? 0 : Number(v));

function normaliseLines(raw: any): Line[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => ({ product_id: l.productId || l.product_id || null, sku: l.sku || null, name: l.name || l.sku || 'Item', qty: Math.max(0, Math.floor(num(l.qty))), unit_cost: num(l.unitCost ?? l.unit_cost) }))
    .filter((l) => l.qty > 0);
}

// GET /app/commerce/purchase-orders — list the tenant's POs, newest first.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.read');
    const db = getServiceClient();
    const { data, error } = await db
      .from('purchase_orders')
      .select('id, supplier_id, supplier_name, status, currency, reference, expected_date, lines, total, received_at, created_at')
      .eq('tenant_id', scope.tenantId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    const orders = (data ?? []).map((po: any) => ({
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
      receivedAt: po.received_at,
      createdAt: po.created_at,
    }));
    res.json({ source: 'medusa', orders });
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

    const total = lines.reduce((a, l) => a + (l.qty ?? 0) * (l.unit_cost ?? 0), 0);
    const db = getServiceClient();
    const { data, error } = await db.from('purchase_orders').insert({
      tenant_id: scope.tenantId,
      supplier_id: supplierId,
      supplier_name: supplierName,
      status: 'draft',
      currency: (b.currency || 'ZAR').toString(),
      reference: (b.reference ?? '').toString().trim() || null,
      expected_date: b.expectedDate || null,
      lines,
      total,
      created_by: scope.userId,
    }).select('id').single();
    if (error || !data) throw new Error(error?.message || 'Could not create the purchase order.');
    res.status(201).json({ id: data.id, supplier: supplierName, total, status: 'draft', lineCount: lines.length });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'po_create_failed', message: (error as Error).message });
  }
}
