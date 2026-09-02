import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys, Modules, ProductStatus } from '@medusajs/framework/utils';
import { createProductsWorkflow, createInventoryLevelsWorkflow } from '@medusajs/medusa/core-flows';
import { assertCapability, ScopeError } from '../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../middlewares/tenant-scope';
import { CatalogueConfigurationError, readCatalogueData } from '../../../catalogue/read';

type Body = {
  sku?: string;
  name?: string;
  category?: string;
  costPrice?: number | string;
  sellingPrice?: number | string;
  stockOnHand?: number | string;
  stockInTransit?: number | string;
  dailyConsumption?: number | string;
  leadTimeDays?: number | string;
  abcClass?: string;
  lifespanMonths?: number | string;
  imageUrl?: string;
  supplierId?: string;
  supplier?: string;
};

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function handleFor(sku: string): string {
  return sku.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Creates a product in the tenant's catalogue. Managing the catalogue requires
// commerce.manage + MFA. The product is published to the tenant's sales channel
// (resolved from tenant_link, same source the read path uses), priced, given a
// starting inventory level at the site stock location, and its photo URL is
// stored as the Medusa thumbnail so every catalogue view reads it live.
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.manage', true);

    const body = (req.body ?? {}) as Body;
    const sku = (body.sku ?? '').toString().trim();
    const name = (body.name ?? '').toString().trim();
    if (!sku) throw new ScopeError(400, 'sku_required', 'A product code (SKU) is required.');
    if (!name) throw new ScopeError(400, 'name_required', 'A product name is required.');

    // Resolve the tenant's commerce scope (sales channel + stock location) the
    // same way the read path does, so writes land exactly where reads look.
    const { context } = await readCatalogueData(req, scope, false);

    const productModule = req.scope.resolve(Modules.PRODUCT);
    const handle = handleFor(sku);
    const existing = await productModule.listProducts({ handle: [handle] }, { take: 1, select: ['id'] });
    if (existing.length) {
      throw new ScopeError(409, 'product_exists', `A product with code ${sku} already exists.`);
    }

    const cost = num(body.costPrice);
    const price = num(body.sellingPrice);
    const soh = Math.max(0, Math.round(num(body.stockOnHand)));
    const transit = Math.max(0, Math.round(num(body.stockInTransit)));
    const currency = (process.env.CURRENCY ?? 'zar').toLowerCase();
    const thumbnail = typeof body.imageUrl === 'string' && body.imageUrl.trim() ? body.imageUrl.trim() : undefined;

    const { result } = await createProductsWorkflow(req.scope).run({
      input: {
        products: [
          {
            title: name,
            handle,
            status: ProductStatus.PUBLISHED,
            thumbnail,
            images: thumbnail ? [{ url: thumbnail }] : undefined,
            sales_channels: [{ id: context.salesChannelId }],
            metadata: {
              category: (body.category ?? '').toString(),
              daily_consumption: num(body.dailyConsumption),
              lead_time_days: num(body.leadTimeDays),
              abc_class: (body.abcClass ?? '').toString(),
              lifespan_months: num(body.lifespanMonths),
              cost_price: cost,
              supplier_id: (body.supplierId ?? '').toString() || null,
              supplier_name: (body.supplier ?? '').toString() || null,
            },
            options: [{ title: 'Variant', values: ['Standard'] }],
            variants: [
              {
                title: 'Standard',
                sku,
                options: { Variant: 'Standard' },
                manage_inventory: true,
                metadata: { cost_price: cost },
                prices: [{ amount: price, currency_code: currency }],
              },
            ],
          },
        ],
      },
    });

    const productId = result?.[0]?.id;

    // Set the starting inventory level at the site stock location, if one is scoped.
    if (context.stockLocationId && productId) {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      const { data } = await query.graph({
        entity: 'product',
        fields: ['id', 'variants.sku', 'variants.inventory_items.inventory_item_id'],
        filters: { id: [productId] },
      } as Parameters<typeof query.graph>[0]);
      const itemIds = ((data ?? []) as Array<{ variants?: Array<{ inventory_items?: Array<{ inventory_item_id?: string | null }> | null }> | null }>)
        .flatMap((p) => p.variants ?? [])
        .flatMap((v) => (v.inventory_items ?? []).map((l) => l.inventory_item_id))
        .filter((id): id is string => Boolean(id));
      if (itemIds.length) {
        await createInventoryLevelsWorkflow(req.scope).run({
          input: {
            inventory_levels: itemIds.map((inventory_item_id) => ({
              inventory_item_id,
              location_id: context.stockLocationId as string,
              stocked_quantity: soh,
              incoming_quantity: transit,
            })),
          },
        });
      }
    }

    res.status(201).json({ id: productId, sku, handle });
  } catch (error) {
    if (error instanceof ScopeError) {
      res.status(error.status).json({ code: error.code, message: error.message });
      return;
    }
    if (error instanceof CatalogueConfigurationError) {
      res.status(409).json({ code: error.code, message: error.message });
      return;
    }
    throw error;
  }
}
