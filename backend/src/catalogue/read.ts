import type { MedusaRequest } from '@medusajs/framework/http';
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils';
import { TENANT_LINK_MODULE } from '../modules/tenant-link';
import type { TenantScope } from '../security/tenant-scope';
import { collectInventoryItemIds, type CatalogueContext, type InventoryLevelRecord, type MedusaProductRecord } from './contract';

type LinkRecord = {
  sales_channel_id?: string | null;
  default_region_id?: string | null;
  stock_location_id?: string | null;
};

type TenantLinkServiceContract = {
  listTenantLinks(filters: Record<string, unknown>, config?: Record<string, unknown>): Promise<LinkRecord[]>;
  listSiteLinks(filters: Record<string, unknown>, config?: Record<string, unknown>): Promise<LinkRecord[]>;
};

type InventoryServiceContract = {
  listInventoryLevels(filters: Record<string, unknown>, config?: Record<string, unknown>): Promise<InventoryLevelRecord[]>;
};

export class CatalogueConfigurationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export async function readCatalogueData(req: MedusaRequest, scope: TenantScope, includePrivateCost = false): Promise<{
  products: MedusaProductRecord[];
  inventoryLevels: InventoryLevelRecord[];
  context: CatalogueContext;
}> {
  const linkService = req.scope.resolve<TenantLinkServiceContract>(TENANT_LINK_MODULE);
  const tenantLinks = await linkService.listTenantLinks({
    supabase_tenant_id: scope.tenantId,
    status: 'active',
  }, { take: 2 });
  const tenantLink = tenantLinks[0];
  if (tenantLinks.length !== 1 || !tenantLink?.sales_channel_id) {
    throw new CatalogueConfigurationError('tenant_commerce_link_required', 'The tenant does not have one active Medusa sales-channel link.');
  }

  let stockLocationId: string | null = null;
  if (scope.siteId) {
    const siteLinks = await linkService.listSiteLinks({
      supabase_tenant_id: scope.tenantId,
      supabase_site_id: scope.siteId,
      status: 'active',
    }, { take: 2 });
    if (siteLinks.length !== 1 || !siteLinks[0]?.stock_location_id) {
      throw new CatalogueConfigurationError('site_inventory_link_required', 'The site does not have one active Medusa stock-location link.');
    }
    stockLocationId = siteLinks[0].stock_location_id;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const variantFields = [
    'variants.id', 'variants.title', 'variants.sku', 'variants.prices.*', 'variants.inventory_items.*',
  ];
  if (includePrivateCost) variantFields.push('variants.metadata');
  const result = await query.graph({
    entity: 'product',
    fields: ['id', 'title', 'description', 'handle', 'thumbnail', 'metadata', 'type.*', 'categories.*', ...variantFields],
    filters: { status: 'published', sales_channels: { id: tenantLink.sales_channel_id } },
    pagination: { skip: 0, take: 250, order: { title: 'ASC' } },
  } as Parameters<typeof query.graph>[0]);
  const products = (result.data ?? []) as MedusaProductRecord[];

  let inventoryLevels: InventoryLevelRecord[] = [];
  const inventoryItemIds = collectInventoryItemIds(products);
  if (stockLocationId && inventoryItemIds.length) {
    const inventoryService = req.scope.resolve<InventoryServiceContract>(Modules.INVENTORY);
    inventoryLevels = await inventoryService.listInventoryLevels({
      inventory_item_id: inventoryItemIds,
      location_id: stockLocationId,
    }, { take: Math.max(inventoryItemIds.length, 100) });
  }

  return {
    products,
    inventoryLevels,
    context: {
      tenantId: scope.tenantId,
      siteId: scope.siteId,
      salesChannelId: tenantLink.sales_channel_id,
      stockLocationId,
      regionId: tenantLink.default_region_id ?? null,
    },
  };
}
