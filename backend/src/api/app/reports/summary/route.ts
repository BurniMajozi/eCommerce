import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { buildCatalogueContract, buildProfitContract } from '../../../../catalogue/contract';
import { readCatalogueData, CatalogueConfigurationError } from '../../../../catalogue/read';
import { assertAnyCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';

// GET /app/reports/summary — real tenant reports built from live commerce data.
// Reachable by reports.read (tenant admin / manager / executive) OR commerce.read
// / platform.manage (merchant / owner), so both role families can run reports.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, ['reports.read', 'commerce.read', 'platform.manage']);

    const data = await readCatalogueData(req, scope, true);
    const profit = buildProfitContract(data.products, data.inventoryLevels, data.context);
    const catalogue = buildCatalogueContract(data.products, data.inventoryLevels, data.context);

    // 1) Stock valuation — per SKU cost / retail / potential profit.
    const stockValuation = {
      rows: profit.items.map((p) => ({
        sku: p.sku, name: p.name, onHand: p.stockOnHand,
        unitCost: p.averageCost, unitPrice: p.averageSellingPrice,
        stockCost: p.stockCostValue, stockRetail: p.stockRetailValue,
        potentialProfit: p.potentialProfit, margin: p.marginPercent,
      })),
      totals: profit.totals,
    };

    // 2) Reorder — SKUs under ~14 days cover, ranked by urgency.
    const reorderRows = catalogue.items
      .map((it: any) => {
        const daily = it.dailyConsumption || 0;
        const cover = daily > 0 ? Math.round((it.stockOnHand + it.stockInTransit) / daily) : null;
        return { sku: it.sku, name: it.name, category: it.category, onHand: it.stockOnHand, inTransit: it.stockInTransit, dailyConsumption: daily, coverDays: cover, leadTimeDays: it.leadTimeDays };
      })
      .filter((r) => r.coverDays !== null && r.coverDays < 14)
      .sort((a, b) => (a.coverDays ?? 0) - (b.coverDays ?? 0));

    // 3) Customer spend vs limit — from customer parties + their live orders.
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data: customers } = await query.graph({
      entity: 'customer', fields: ['id', 'email', 'company_name', 'metadata'], pagination: { skip: 0, take: 200 },
    } as Parameters<typeof query.graph>[0]);
    const spentByCustomer = new Map<string, number>();
    const orderRows: Array<Record<string, any>> = [];
    try {
      const { data: orders } = await query.graph({
        entity: 'order', fields: ['id', 'display_id', 'customer_id', 'email', 'total', 'currency_code', 'status', 'created_at'], pagination: { skip: 0, take: 500 },
      } as Parameters<typeof query.graph>[0]);
      for (const o of orders ?? []) {
        if (o.customer_id) spentByCustomer.set(o.customer_id, (spentByCustomer.get(o.customer_id) ?? 0) + Number(o.total ?? 0));
        orderRows.push({ order: o.display_id ? `#${o.display_id}` : String(o.id).slice(0, 12), email: o.email ?? '', total: Number(o.total ?? 0), currency: (o.currency_code ?? 'zar').toUpperCase(), status: o.status ?? 'pending', date: (o.created_at ? String(o.created_at) : '').slice(0, 10) });
      }
    } catch { /* orders unavailable */ }

    const customerSpend = (customers ?? [])
      .filter((c: any) => (c.metadata?.party_type ?? 'customer') !== 'supplier')
      .map((c: any) => {
        const limit = c.metadata?.spend_limit != null ? Number(c.metadata.spend_limit) : null;
        const spent = spentByCustomer.get(c.id) ?? 0;
        return {
          company: c.company_name || c.email || 'Customer',
          currency: c.metadata?.currency || 'ZAR',
          limit, spent,
          pctUsed: limit && limit > 0 ? Math.round((spent / limit) * 100) : null,
        };
      });

    res.json({
      source: 'medusa',
      generatedAt: new Date().toISOString(),
      reports: {
        stockValuation,
        reorder: { rows: reorderRows },
        customerSpend: { rows: customerSpend },
        orders: { rows: orderRows.sort((a, b) => (b.date > a.date ? 1 : -1)) },
      },
      dataQuality: profit.dataQuality,
    });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    if (error instanceof CatalogueConfigurationError) { res.status(409).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'report_failed', message: (error as Error).message });
  }
}
