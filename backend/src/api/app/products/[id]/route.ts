import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import {
  updateProductsWorkflow,
  deleteProductsWorkflow,
  updateInventoryLevelsWorkflow,
  createInventoryLevelsWorkflow,
} from '@medusajs/medusa/core-flows';
import { assertCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';
import { CatalogueConfigurationError, readCatalogueData } from '../../../../catalogue/read';

type Body = {
  name?: string;
  category?: string;
  costPrice?: number | string;
  sellingPrice?: number | string;
  stockOnHand?: number | string;
  dailyConsumption?: number | string;
  leadTimeDays?: number | string;
  abcClass?: string;
  lifespanMonths?: number | string;
  imageUrl?: string;
  supplierId?: string;
  supplier?: string;
};

const has = (v: unknown): boolean => v !== undefined && v !== null && `${v}`.trim() !== '';
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};

// PATCH /app/products/:id — edit a product in the tenant's catalogue
// (name, category, cost/price, planning fields, photo, stock). commerce.manage + MFA.
export async function PATCH(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.manage', true);

    const id = req.params.id;
    const body = (req.body ?? {}) as Body;
    const { context } = await readCatalogueData(req, scope, false);
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

    const { data } = await query.graph({
      entity: 'product',
      fields: [
        'id', 'metadata', 'thumbnail',
        'variants.id', 'variants.sku', 'variants.metadata',
        'variants.inventory_items.inventory_item_id',
      ],
      filters: { id: [id] },
    } as Parameters<typeof query.graph>[0]);
    const product = (data ?? [])[0] as
      | { id: string; metadata?: Record<string, unknown> | null; variants?: Array<{ id: string; metadata?: Record<string, unknown> | null; inventory_items?: Array<{ inventory_item_id?: string | null }> | null }> | null }
      | undefined;
    if (!product) throw new ScopeError(404, 'product_not_found', 'Product not found in this catalogue.');

    // Merge metadata so unspecified planning fields are preserved.
    const metadata = { ...(product.metadata ?? {}) } as Record<string, unknown>;
    if (has(body.category)) metadata.category = body.category!.toString();
    if (has(body.dailyConsumption)) metadata.daily_consumption = num(body.dailyConsumption);
    if (has(body.leadTimeDays)) metadata.lead_time_days = num(body.leadTimeDays);
    if (has(body.abcClass)) metadata.abc_class = body.abcClass!.toString();
    if (has(body.lifespanMonths)) metadata.lifespan_months = num(body.lifespanMonths);
    if (has(body.costPrice)) metadata.cost_price = num(body.costPrice);
    if (body.supplierId !== undefined) metadata.supplier_id = body.supplierId ? body.supplierId.toString() : null;
    if (body.supplier !== undefined) metadata.supplier_name = body.supplier ? body.supplier.toString() : null;

    const productUpdate: Record<string, unknown> = { id, metadata };
    if (has(body.name)) productUpdate.title = body.name!.toString().trim();
    if (has(body.imageUrl)) {
      productUpdate.thumbnail = body.imageUrl!.toString().trim();
      productUpdate.images = [{ url: body.imageUrl!.toString().trim() }];
    }

    const variant = product.variants?.[0];
    if (variant && (has(body.sellingPrice) || has(body.costPrice))) {
      const variantMeta = { ...(variant.metadata ?? {}) } as Record<string, unknown>;
      if (has(body.costPrice)) variantMeta.cost_price = num(body.costPrice);
      productUpdate.variants = [{
        id: variant.id,
        metadata: variantMeta,
        ...(has(body.sellingPrice)
          ? { prices: [{ amount: num(body.sellingPrice), currency_code: (process.env.CURRENCY ?? 'zar').toLowerCase() }] }
          : {}),
      }];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await updateProductsWorkflow(req.scope).run({ input: { products: [productUpdate] } as any });

    // Adjust stock at the site location if requested.
    if (has(body.stockOnHand) && context.stockLocationId && variant) {
      const itemId = variant.inventory_items?.[0]?.inventory_item_id;
      if (itemId) {
        const level = { inventory_item_id: itemId, location_id: context.stockLocationId, stocked_quantity: Math.max(0, Math.round(num(body.stockOnHand))) };
        try {
          await updateInventoryLevelsWorkflow(req.scope).run({ input: { updates: [level] } });
        } catch {
          // No level at this location yet — create it instead.
          await createInventoryLevelsWorkflow(req.scope).run({ input: { inventory_levels: [level] } });
        }
      }
    }

    res.json({ id, updated: true });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    if (error instanceof CatalogueConfigurationError) { res.status(409).json({ code: error.code, message: error.message }); return; }
    throw error;
  }
}

// DELETE /app/products/:id — remove a product from the catalogue. commerce.manage + MFA.
export async function DELETE(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.manage', true);
    await deleteProductsWorkflow(req.scope).run({ input: { ids: [req.params.id] } });
    res.json({ id: req.params.id, deleted: true });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    throw error;
  }
}
