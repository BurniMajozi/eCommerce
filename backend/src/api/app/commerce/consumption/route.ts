import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { assertAnyCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';
import { readCatalogueData } from '../../../../catalogue/read';

const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
const num = (v: any): number => (v == null || v === '' || isNaN(Number(v)) ? 0 : Number(v));

// GET /app/commerce/consumption?days=90 — self-driven daily consumption per SKU,
// computed from actual outflow history (contractor-store pickups + B2B orders)
// over a trailing window. This feeds the replenishment engine so the reorder
// trigger fires on real usage, not a hand-entered rate.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, ['commerce.read', 'commerce.manage', 'reports.read', 'platform.manage']);

    const days = Math.min(365, Math.max(7, Math.floor(num((req.query as any)?.days)) || 90));
    const cutoff = new Date(Date.now() - days * 86400000);
    const qty: Record<string, number> = {};
    const add = (sku: unknown, q: unknown) => {
      const s = String(sku ?? '').trim();
      const n = num(q);
      if (!s || n <= 0) return;
      qty[s] = (qty[s] ?? 0) + n;
    };

    // 1) Contractor-store pickups (tenant-scoped table). Count issued/paid demand.
    try {
      const rows = await pg(req)('store_orders')
        .where({ tenant_id: scope.tenantId })
        .whereNot('status', 'cancelled')
        .where('created_at', '>=', cutoff);
      for (const r of rows ?? []) {
        const lines = Array.isArray(r.lines) ? r.lines : (() => { try { return JSON.parse(r.lines ?? '[]'); } catch { return []; } })();
        for (const l of lines) add(l.sku, l.qty ?? l.quantity);
      }
    } catch { /* store table may be empty */ }

    // 2) B2B / storefront orders on this tenant's sales channel.
    try {
      const { context } = await readCatalogueData(req, scope, false);
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      const { data } = await query.graph({
        entity: 'order',
        fields: ['id', 'created_at', 'sales_channel_id', 'metadata', 'items.quantity', 'items.variant_sku'],
        filters: { sales_channel_id: context.salesChannelId },
        pagination: { skip: 0, take: 1000 },
      } as Parameters<typeof query.graph>[0]);
      for (const o of data ?? []) {
        if (o.created_at && new Date(o.created_at) < cutoff) continue;
        const meta = (o.metadata ?? {}) as Record<string, any>;
        const metaLines = Array.isArray(meta.items) ? meta.items : [];
        if (metaLines.length) {
          for (const l of metaLines) add(l.sku ?? l.variant_sku, l.qty ?? l.quantity);
        } else {
          for (const it of o.items ?? []) add(it.variant_sku, it.quantity);
        }
      }
    } catch { /* orders unavailable */ }

    const bySku: Record<string, number> = {};
    for (const [sku, total] of Object.entries(qty)) {
      bySku[sku] = Number((total / days).toFixed(3));
    }

    res.json({ source: 'medusa', windowDays: days, skuCount: Object.keys(bySku).length, bySku });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'consumption_failed', message: (error as Error).message });
  }
}
