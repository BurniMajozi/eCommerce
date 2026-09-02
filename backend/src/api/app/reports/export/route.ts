import type { MedusaResponse } from '@medusajs/framework/http';
import { buildCatalogueContract, buildProfitContract } from '../../../../catalogue/contract';
import { readCatalogueData, CatalogueConfigurationError } from '../../../../catalogue/read';
import { assertCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';

// GET /app/reports/export — a server-authoritative stock report the tenant can
// hand to the mine. Gated on reports.run, which is MFA-flagged, so exporting a
// report requires an authenticator (aal2) session.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'reports.run'); // requires_mfa → aal2 enforced

    const data = await readCatalogueData(req, scope, true);
    const profit = buildProfitContract(data.products, data.inventoryLevels, data.context);
    const catalogue = buildCatalogueContract(data.products, data.inventoryLevels, data.context) as { items: Array<Record<string, any>> };

    const bySku = new Map<string, { category: string; inTransit: number; cover: number | null }>();
    for (const it of catalogue.items) {
      const daily = Number(it.dailyConsumption || 0);
      bySku.set(it.sku, {
        category: it.category ?? '',
        inTransit: Number(it.stockInTransit || 0),
        cover: daily > 0 ? Math.round((Number(it.stockOnHand || 0) + Number(it.stockInTransit || 0)) / daily) : null,
      });
    }

    const rows = profit.items.map((p: any) => {
      const c = bySku.get(p.sku) || { category: '', inTransit: 0, cover: null };
      return {
        sku: p.sku, name: p.name, category: c.category,
        onHand: p.stockOnHand, inTransit: c.inTransit,
        unitCost: p.averageCost, unitPrice: p.averageSellingPrice,
        stockCost: p.stockCostValue, stockRetail: p.stockRetailValue,
        coverDays: c.cover,
      };
    });

    res.json({
      generatedAt: new Date().toISOString(),
      currency: (process.env.CURRENCY ?? 'zar').toUpperCase(),
      totals: profit.totals,
      rows,
    });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    if (error instanceof CatalogueConfigurationError) { res.status(409).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'report_export_failed', message: (error as Error).message });
  }
}
