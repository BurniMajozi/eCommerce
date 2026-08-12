type PriceRule = { attribute?: string; value?: string };

export type MedusaPriceRecord = {
  amount?: unknown;
  currency_code?: string | null;
  rules?: Record<string, unknown> | null;
  price_rules?: PriceRule[] | null;
};

export type MedusaInventoryLinkRecord = {
  inventory_item_id?: string | null;
  required_quantity?: unknown;
};

export type MedusaVariantRecord = {
  id?: string;
  title?: string | null;
  sku?: string | null;
  metadata?: Record<string, unknown> | null;
  prices?: MedusaPriceRecord[] | null;
  inventory_items?: MedusaInventoryLinkRecord[] | null;
};

export type MedusaProductRecord = {
  id: string;
  title?: string | null;
  description?: string | null;
  handle?: string | null;
  metadata?: Record<string, unknown> | null;
  categories?: Array<{ name?: string | null }> | null;
  type?: { value?: string | null } | null;
  variants?: MedusaVariantRecord[] | null;
};

export type InventoryLevelRecord = {
  inventory_item_id?: string;
  location_id?: string;
  stocked_quantity?: unknown;
  reserved_quantity?: unknown;
  incoming_quantity?: unknown;
};

export type CatalogueContext = {
  tenantId: string;
  siteId: string | null;
  salesChannelId: string;
  stockLocationId: string | null;
  regionId: string | null;
};

function finite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function metadataNumber(metadata: Record<string, unknown> | null | undefined, key: string): number | null {
  return finite(metadata?.[key]);
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function priceMatchesRegion(price: MedusaPriceRecord, regionId: string | null): boolean {
  if (!regionId) return true;
  if (price.rules?.region_id === regionId) return true;
  return price.price_rules?.some((rule) => rule.attribute === 'region_id' && rule.value === regionId) ?? false;
}

export function selectSellingPrice(variant: MedusaVariantRecord, regionId: string | null): number | null {
  const prices = variant.prices ?? [];
  const regionPrice = prices.find((price) => priceMatchesRegion(price, regionId));
  return finite(regionPrice?.amount ?? prices[0]?.amount);
}

function variantInventory(
  variant: MedusaVariantRecord,
  levelsByItemId: Map<string, InventoryLevelRecord>,
): { stockOnHand: number; stockReserved: number; stockAvailable: number; stockInTransit: number } | null {
  const links = variant.inventory_items ?? [];
  if (!links.length) return null;

  let stockOnHand = 0;
  let stockReserved = 0;
  let stockAvailable = 0;
  let stockInTransit = 0;
  let matched = false;

  for (const link of links) {
    if (!link.inventory_item_id) continue;
    const level = levelsByItemId.get(link.inventory_item_id);
    if (!level) continue;
    matched = true;
    const required = Math.max(1, finite(link.required_quantity) ?? 1);
    const stocked = finite(level.stocked_quantity) ?? 0;
    const reserved = finite(level.reserved_quantity) ?? 0;
    const incoming = finite(level.incoming_quantity) ?? 0;
    stockOnHand += Math.floor(stocked / required);
    stockReserved += Math.floor(reserved / required);
    stockAvailable += Math.max(0, Math.floor((stocked - reserved) / required));
    stockInTransit += Math.floor(incoming / required);
  }

  return matched ? { stockOnHand, stockReserved, stockAvailable, stockInTransit } : null;
}

export function collectInventoryItemIds(products: MedusaProductRecord[]): string[] {
  return [...new Set(products.flatMap((product) =>
    (product.variants ?? []).flatMap((variant) =>
      (variant.inventory_items ?? []).map((link) => link.inventory_item_id).filter(Boolean) as string[])))];
}

export function buildCatalogueContract(
  products: MedusaProductRecord[],
  inventoryLevels: InventoryLevelRecord[],
  context: CatalogueContext,
) {
  const levelsByItemId = new Map(
    inventoryLevels
      .filter((level) => level.inventory_item_id && level.location_id === context.stockLocationId)
      .map((level) => [level.inventory_item_id as string, level]),
  );

  const items = products.map((product) => {
    const variants = (product.variants ?? []).map((variant) => {
      const inventory = context.stockLocationId ? variantInventory(variant, levelsByItemId) : null;
      return {
        id: variant.id ?? null,
        sku: variant.sku ?? null,
        name: variant.title ?? product.title ?? '',
        sellingPrice: selectSellingPrice(variant, context.regionId),
        ...inventory,
      };
    });
    const prices = variants.map((variant) => variant.sellingPrice).filter((value): value is number => value !== null);
    const inventory = variants.filter((variant) => variant.stockOnHand !== undefined);
    const sku = variants.find((variant) => variant.sku)?.sku ?? product.handle ?? product.id;
    const missing = [];
    if (!variants.some((variant) => variant.sku)) missing.push('sku');
    if (!prices.length) missing.push('selling_price');
    if (context.siteId && !inventory.length) missing.push('site_inventory');

    return {
      id: product.id,
      sku,
      name: product.title ?? sku,
      description: product.description ?? '',
      category: product.categories?.[0]?.name ?? product.type?.value ?? metadataString(product.metadata, 'category') ?? '',
      sellingPrice: prices.length ? Math.min(...prices) : 0,
      stockOnHand: inventory.reduce((sum, variant) => sum + (variant.stockOnHand ?? 0), 0),
      stockReserved: inventory.reduce((sum, variant) => sum + (variant.stockReserved ?? 0), 0),
      stockAvailable: inventory.reduce((sum, variant) => sum + (variant.stockAvailable ?? 0), 0),
      stockInTransit: inventory.reduce((sum, variant) => sum + (variant.stockInTransit ?? 0), 0),
      dailyConsumption: metadataNumber(product.metadata, 'daily_consumption') ?? 0,
      leadTimeDays: metadataNumber(product.metadata, 'lead_time_days') ?? 0,
      abcClass: metadataString(product.metadata, 'abc_class') ?? '',
      lifespanMonths: metadataNumber(product.metadata, 'lifespan_months') ?? 0,
      variants,
      dataQuality: { complete: missing.length === 0, missing },
    };
  });

  return {
    source: 'medusa' as const,
    scope: {
      tenant_id: context.tenantId,
      site_id: context.siteId,
      sales_channel_id: context.salesChannelId,
      stock_location_id: context.stockLocationId,
      region_id: context.regionId,
    },
    items,
    count: items.length,
    dataQuality: {
      complete: items.every((item) => item.dataQuality.complete),
      incompleteItems: items.filter((item) => !item.dataQuality.complete).length,
    },
  };
}

export function buildProfitContract(
  products: MedusaProductRecord[],
  inventoryLevels: InventoryLevelRecord[],
  context: CatalogueContext,
) {
  const levelsByItemId = new Map(
    inventoryLevels
      .filter((level) => level.inventory_item_id && level.location_id === context.stockLocationId)
      .map((level) => [level.inventory_item_id as string, level]),
  );

  const items = products.map((product) => {
    const variants = (product.variants ?? []).map((variant) => {
      const sellingPrice = selectSellingPrice(variant, context.regionId);
      const costPrice = metadataNumber(variant.metadata, 'cost_price') ?? metadataNumber(product.metadata, 'cost_price');
      const inventory = context.stockLocationId ? variantInventory(variant, levelsByItemId) : null;
      const stockOnHand = inventory?.stockOnHand ?? 0;
      const stockCostValue = costPrice === null ? null : costPrice * stockOnHand;
      const stockRetailValue = sellingPrice === null ? null : sellingPrice * stockOnHand;
      return {
        id: variant.id ?? null,
        sku: variant.sku ?? null,
        name: variant.title ?? product.title ?? '',
        costPrice,
        sellingPrice,
        profitPerUnit: costPrice === null || sellingPrice === null ? null : sellingPrice - costPrice,
        marginPercent: costPrice === null || !sellingPrice ? null : ((sellingPrice - costPrice) / sellingPrice) * 100,
        stockOnHand,
        stockCostValue,
        stockRetailValue,
        potentialProfit: stockCostValue === null || stockRetailValue === null ? null : stockRetailValue - stockCostValue,
      };
    });
    const valued = variants.filter((variant) => variant.stockCostValue !== null && variant.stockRetailValue !== null);
    const stockCostValue = valued.reduce((sum, variant) => sum + (variant.stockCostValue ?? 0), 0);
    const stockRetailValue = valued.reduce((sum, variant) => sum + (variant.stockRetailValue ?? 0), 0);
    const potentialProfit = stockRetailValue - stockCostValue;
    const unitCosts = variants.map((variant) => variant.costPrice).filter((value): value is number => value !== null);
    const unitPrices = variants.map((variant) => variant.sellingPrice).filter((value): value is number => value !== null);

    return {
      id: product.id,
      sku: variants.find((variant) => variant.sku)?.sku ?? product.handle ?? product.id,
      name: product.title ?? product.id,
      averageCost: unitCosts.length ? unitCosts.reduce((sum, value) => sum + value, 0) / unitCosts.length : null,
      averageSellingPrice: unitPrices.length ? unitPrices.reduce((sum, value) => sum + value, 0) / unitPrices.length : null,
      stockOnHand: variants.reduce((sum, variant) => sum + variant.stockOnHand, 0),
      stockCostValue,
      stockRetailValue,
      potentialProfit,
      marginPercent: stockRetailValue > 0 ? (potentialProfit / stockRetailValue) * 100 : null,
      variants,
      dataQuality: {
        complete: variants.length > 0 && variants.every((variant) => variant.costPrice !== null && variant.sellingPrice !== null),
        missingCostVariants: variants.filter((variant) => variant.costPrice === null).length,
        missingPriceVariants: variants.filter((variant) => variant.sellingPrice === null).length,
      },
    };
  });

  return {
    source: 'medusa' as const,
    scope: {
      tenant_id: context.tenantId,
      site_id: context.siteId,
      sales_channel_id: context.salesChannelId,
      stock_location_id: context.stockLocationId,
      region_id: context.regionId,
    },
    items,
    totals: {
      stockCostValue: items.reduce((sum, item) => sum + item.stockCostValue, 0),
      stockRetailValue: items.reduce((sum, item) => sum + item.stockRetailValue, 0),
      potentialProfit: items.reduce((sum, item) => sum + item.potentialProfit, 0),
    },
    dataQuality: {
      complete: items.every((item) => item.dataQuality.complete),
      incompleteItems: items.filter((item) => !item.dataQuality.complete).length,
    },
  };
}
