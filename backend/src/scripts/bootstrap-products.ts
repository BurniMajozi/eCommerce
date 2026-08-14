import type { ExecArgs } from '@medusajs/framework/types';
import { ContainerRegistrationKeys, Modules, ProductStatus } from '@medusajs/framework/utils';
import { createProductsWorkflow, createInventoryLevelsWorkflow } from '@medusajs/medusa/core-flows';

// Seeds the real CageLi / DROMEX PPE catalogue into Medusa so the live
// Products & Pricing, Inventory and B2B storefront read real data instead of
// mock. Prices come from "CageLi 2026 Prices Margin.csv" (authoritative);
// stock + planning metadata (ABC/consumption/lead-time/lifespan) come from the
// merchant's stock sheet where a SKU is known, honest zeros otherwise.
//
// Amounts are in MAJOR currency units (Medusa v2 pricing stores decimals):
// price 2900 == R2900.00. cost_price lives in variant metadata (private) and is
// read by the /app/catalogue/profit contract; the planning fields live in
// product metadata and are read by /app/catalogue.
//
// Idempotent: products whose handle already exists are skipped, so re-running
// only adds what is missing. Run from backend/:
//   SALES_CHANNEL_ID=sc_... STOCK_LOCATION_ID=sloc_... CURRENCY=zar \
//   npm run bootstrap:products

type Seed = {
  sku: string;
  name: string;
  category: string;
  cost: number;      // R, major units
  price: number;     // R, major units
  soh: number;       // stock on hand at the site
  transit: number;   // incoming / in transit
  daily: number;     // daily consumption (planning)
  lead: number;      // lead time in days
  abc: 'A' | 'B' | 'C';
  life: number;      // usable lifespan in months
};

// The full catalogue. First 24 carry real stock + planning data from the
// merchant sheet; the trailing block are SKUs that appear only on the 2026
// price list — real prices, stock unknown (0) until the merchant counts them.
const CATALOGUE: Seed[] = [
  { sku: 'DW-ARC40-WJ', name: 'DROMEX ARC 40 CAL WINTER JACKETS', category: 'Arc Flash Protection', cost: 1700.0, price: 2900.0, soh: 14, transit: 10, daily: 0.5, lead: 14, abc: 'A', life: 12 },
  { sku: 'DW-ARC15-J', name: 'DROMEX ARC HRC2 - 15Cal JACKET', category: 'Arc Flash Protection', cost: 770.0, price: 1200.0, soh: 22, transit: 15, daily: 1.1, lead: 10, abc: 'A', life: 12 },
  { sku: 'DW-ARC15-P', name: 'DROMEX ARC HRC2 - 15Cal PANTS', category: 'Arc Flash Protection', cost: 770.0, price: 650.0, soh: 18, transit: 15, daily: 1.0, lead: 10, abc: 'A', life: 12 },
  { sku: 'DW-ARC9.9-SST', name: 'DROMEX ARC T-SHIRT SHORT SLEEVE, 9.9 CAL', category: 'Arc Flash Protection', cost: 506.0, price: 150.0, soh: 45, transit: 30, daily: 2.0, lead: 7, abc: 'B', life: 6 },
  { sku: 'DW-TSHIRTGY', name: 'DROMEX GREY 100% Cotton Crew neck tee shirt', category: 'Workwear', cost: 56.1, price: 360.0, soh: 120, transit: 50, daily: 5.0, lead: 5, abc: 'C', life: 3 },
  { sku: 'DW-6535XX-J', name: 'DROMEX COLOURS 6535 Polycotton SANS 434 CONTI Jacket', category: 'Workwear', cost: 161.7, price: 330.0, soh: 68, transit: 40, daily: 3.2, lead: 7, abc: 'B', life: 6 },
  { sku: 'DW-6535XX-P', name: 'DROMEX COLOURS 6535 Polycotton SANS 434 CONTI Pants', category: 'Workwear', cost: 150.7, price: 330.0, soh: 74, transit: 40, daily: 3.2, lead: 7, abc: 'B', life: 6 },
  { sku: 'PROMAX', name: 'PROMAX White Disposable Overalls', category: 'Protective Overalls', cost: 47.3, price: 110.0, soh: 340, transit: 200, daily: 18.0, lead: 3, abc: 'C', life: 0.1 },
  { sku: 'DW-CONTI-RTOR', name: 'DROMEX ORANGECONTI SUITS with Reflective', category: 'Workwear', cost: 143.0, price: 155.0, soh: 55, transit: 25, daily: 2.5, lead: 7, abc: 'B', life: 6 },
  { sku: 'CEM', name: 'Classic Muff, SNR 30, Blue', category: 'Hearing Protection', cost: 93.5, price: 125.0, soh: 85, transit: 30, daily: 1.5, lead: 5, abc: 'B', life: 12 },
  { sku: '1020', name: 'DROMEX FFP2 Respirator Mask (SABS REF: AZ2004/18)', category: 'Respiratory Protection', cost: 6.74, price: 15.0, soh: 850, transit: 500, daily: 45.0, lead: 2, abc: 'C', life: 0.1 },
  { sku: 'NITRIFLEX-PC', name: 'NITRIFLEX Black Sanitized PALM Nitrile Coated Gloves', category: 'Hand Protection', cost: 19.01, price: 28.0, soh: 420, transit: 200, daily: 22.0, lead: 3, abc: 'C', life: 0.5 },
  { sku: 'MIIZULFM4001W', name: 'MIIZU 400 THERMAL, HI VIZ, WINTER Gloves', category: 'Hand Protection', cost: 36.19, price: 42.0, soh: 110, transit: 50, daily: 4.0, lead: 5, abc: 'C', life: 1 },
  { sku: 'DH-HH-DB', name: 'Dromex Hard Hat DARK BLUE (Lamination Blue)', category: 'Head Protection', cost: 73.7, price: 120.0, soh: 45, transit: 20, daily: 0.8, lead: 7, abc: 'B', life: 24 },
  { sku: 'DH-HH-W', name: 'Dromex Hard Hat WHITE', category: 'Head Protection', cost: 73.7, price: 120.0, soh: 60, transit: 20, daily: 1.0, lead: 7, abc: 'B', life: 24 },
  { sku: 'DV-326B-C-AF', name: 'SPOGGLE, CLEAR, ANTI MIST', category: 'Eye Protection', cost: 61.05, price: 98.0, soh: 130, transit: 60, daily: 3.5, lead: 4, abc: 'B', life: 6 },
  { sku: 'ACE ONE 60x90', name: 'ACE Leather Welders Apron 60x90cm', category: 'Specialized Safety', cost: 80.3, price: 103.0, soh: 28, transit: 10, daily: 0.4, lead: 8, abc: 'B', life: 12 },
  { sku: 'DF-CHELSEA-BLK', name: 'DROMEX CHELSEA BLACK BOOT', category: 'Footwear', cost: 696.3, price: 1080.0, soh: 12, transit: 20, daily: 0.9, lead: 12, abc: 'A', life: 6 },
  { sku: 'DF-CHELSEA-BR', name: 'DROMEX CHELSEA BROWN BOOT', category: 'Footwear', cost: 696.3, price: 1085.0, soh: 16, transit: 20, daily: 0.8, lead: 12, abc: 'A', life: 6 },
  { sku: 'DF-UBLK', name: 'DROMEX ULTECO SAFETY BOOT BLACK', category: 'Footwear', cost: 413.6, price: 720.0, soh: 34, transit: 25, daily: 1.5, lead: 10, abc: 'B', life: 6 },
  { sku: 'DB-STG-J', name: 'DROMEX STORM GLACIER FREEZER JACKET', category: 'Thermal Gear', cost: 310.2, price: 500.0, soh: 19, transit: 10, daily: 0.3, lead: 10, abc: 'B', life: 12 },
  { sku: 'DF-SP-STCM', name: 'DROMEX SPARTACUS GUMBOOT, STCM', category: 'Footwear', cost: 183.7, price: 390.0, soh: 48, transit: 30, daily: 2.1, lead: 7, abc: 'B', life: 6 },
  { sku: 'SA10-LIME', name: 'LIME Reflective Vest, ZIP, ID POUCH', category: 'Workwear', cost: 22.55, price: 70.0, soh: 210, transit: 100, daily: 8.5, lead: 3, abc: 'C', life: 3 },
  { sku: 'DF-FLASH', name: 'DROMEX FLASHTREAD ARC BOOT', category: 'Footwear', cost: 1109.9, price: 1560.0, soh: 8, transit: 15, daily: 0.3, lead: 14, abc: 'A', life: 12 },
  // --- 2026 price-list additions (stock to be counted by the merchant) ---
  { sku: 'GGOAT', name: 'Goatskin VIP Glove, Keystone', category: 'Hand Protection', cost: 27.37, price: 40.0, soh: 0, transit: 0, daily: 0, lead: 7, abc: 'C', life: 1 },
  { sku: 'NITRIFLEX', name: 'NITRIFLEX Black Sanitized FULL Nitrile Coated Gloves', category: 'Hand Protection', cost: 23.41, price: 56.0, soh: 0, transit: 0, daily: 0, lead: 3, abc: 'C', life: 0.5 },
  { sku: 'CRONUS/RGE', name: 'DROMEX CRONUS RED/GREEN PVC Gloves, reinforced elbow', category: 'Hand Protection', cost: 18.7, price: 35.0, soh: 0, transit: 0, daily: 0, lead: 7, abc: 'C', life: 1 },
  { sku: 'DV-11', name: 'DIRECT MESH VENT Goggle (1,F)', category: 'Eye Protection', cost: 8.03, price: 17.0, soh: 0, transit: 0, daily: 0, lead: 4, abc: 'C', life: 6 },
  { sku: 'DV-004MAX', name: 'IN-DIRECT ULTIMATE VISION, WIDE BAND ELASTIC', category: 'Eye Protection', cost: 49.5, price: 130.0, soh: 0, transit: 0, daily: 0, lead: 4, abc: 'B', life: 6 },
  { sku: 'DV-026-IR5', name: 'SHADE 5.0 GREEN Goggle, ANTI SCRATCH', category: 'Eye Protection', cost: 31.13, price: 68.0, soh: 0, transit: 0, daily: 0, lead: 4, abc: 'B', life: 6 },
  { sku: 'DV-326B-G-AF', name: 'SPOGGLE, GREY, ANTI MIST', category: 'Eye Protection', cost: 61.05, price: 103.0, soh: 0, transit: 0, daily: 0, lead: 4, abc: 'B', life: 6 },
  { sku: '1021', name: 'DROMEX FFP2 V Respirator Mask (SABS REF: AZ2004/17)', category: 'Respiratory Protection', cost: 12.33, price: 20.0, soh: 0, transit: 0, daily: 0, lead: 2, abc: 'C', life: 0.1 },
  { sku: 'DF-SS1050-BLK', name: 'DROMEX BOXER CHELSEA BOOT BLACK', category: 'Footwear', cost: 303.6, price: 800.0, soh: 0, transit: 0, daily: 0, lead: 10, abc: 'B', life: 6 },
  { sku: 'DF-SS1050-BR', name: 'DROMEX BOXER CHELSEA BOOT BROWN', category: 'Footwear', cost: 303.6, price: 800.0, soh: 0, transit: 0, daily: 0, lead: 10, abc: 'B', life: 6 },
];

const env = (key: string): string | undefined => process.env[key]?.trim() || undefined;
function required(key: string): string {
  const value = env(key);
  if (!value) throw new Error(`${key} is required (get it from the tenant_link / bootstrap-commerce output).`);
  return value;
}

// Medusa handles must be url-safe and unique. Derive from the SKU.
function handleFor(sku: string): string {
  return sku.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export default async function bootstrapProducts({ container }: ExecArgs): Promise<void> {
  const salesChannelId = required('SALES_CHANNEL_ID');
  const stockLocationId = env('STOCK_LOCATION_ID');
  const currency = (env('CURRENCY') ?? 'zar').toLowerCase();

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const productModule = container.resolve(Modules.PRODUCT);

  // Idempotency: skip products whose handle already exists.
  const handles = CATALOGUE.map((c) => handleFor(c.sku));
  const existing = await productModule.listProducts(
    { handle: handles },
    { take: CATALOGUE.length + 10, select: ['id', 'handle'] },
  );
  const existingHandles = new Set(existing.map((p) => p.handle));
  const toCreate = CATALOGUE.filter((c) => !existingHandles.has(handleFor(c.sku)));

  logger.info(`[products] ${CATALOGUE.length} in catalogue, ${existingHandles.size} already present, creating ${toCreate.length}.`);

  if (toCreate.length) {
    const input = toCreate.map((c) => ({
      title: c.name,
      handle: handleFor(c.sku),
      status: ProductStatus.PUBLISHED,
      sales_channels: [{ id: salesChannelId }],
      // planning + display metadata read by /app/catalogue
      metadata: {
        category: c.category,
        daily_consumption: c.daily,
        lead_time_days: c.lead,
        abc_class: c.abc,
        lifespan_months: c.life,
        cost_price: c.cost, // product-level fallback for the profit contract
      },
      options: [{ title: 'Variant', values: ['Standard'] }],
      variants: [
        {
          title: 'Standard',
          sku: c.sku,
          options: { Variant: 'Standard' },
          manage_inventory: true,
          // cost_price is private and read only by the profit contract
          metadata: { cost_price: c.cost },
          prices: [{ amount: c.price, currency_code: currency }],
        },
      ],
    }));

    await createProductsWorkflow(container).run({ input: { products: input } });
    logger.info(`[products] created ${toCreate.length} products.`);
  }

  // Set inventory levels at the stock location so the site sees real stock.
  if (!stockLocationId) {
    logger.warn('[products] STOCK_LOCATION_ID not set — products created but stock levels left unset (will read as 0).');
    return;
  }

  // Fetch the inventory item id for every seeded SKU.
  const { data: products } = await query.graph({
    entity: 'product',
    fields: ['id', 'variants.sku', 'variants.inventory_items.inventory_item_id'],
    filters: { handle: handles },
  } as Parameters<typeof query.graph>[0]);

  const bySku = new Map(CATALOGUE.map((c) => [c.sku, c]));
  const inventoryModule = container.resolve(Modules.INVENTORY);

  // Which inventory items already have a level here (so re-runs don't duplicate)?
  type VariantRow = { sku?: string | null; inventory_items?: Array<{ inventory_item_id?: string | null }> | null };
  const itemIds = ((products ?? []) as Array<{ variants?: VariantRow[] | null }>)
    .flatMap((p) => p.variants ?? [])
    .flatMap((v) => (v.inventory_items ?? []).map((l) => l.inventory_item_id))
    .filter((id): id is string => Boolean(id));

  const existingLevels = itemIds.length
    ? await inventoryModule.listInventoryLevels(
        { inventory_item_id: itemIds, location_id: stockLocationId },
        { take: itemIds.length },
      )
    : [];
  const leveledItems = new Set(existingLevels.map((l) => l.inventory_item_id));

  const levels: Array<{ inventory_item_id: string; location_id: string; stocked_quantity: number; incoming_quantity: number }> = [];
  for (const product of (products ?? []) as Array<{ variants?: VariantRow[] | null }>) {
    for (const variant of product.variants ?? []) {
      const seed = variant.sku ? bySku.get(variant.sku) : undefined;
      if (!seed) continue;
      for (const link of variant.inventory_items ?? []) {
        const itemId = link.inventory_item_id;
        if (!itemId || leveledItems.has(itemId)) continue;
        levels.push({
          inventory_item_id: itemId,
          location_id: stockLocationId,
          stocked_quantity: seed.soh,
          incoming_quantity: seed.transit,
        });
      }
    }
  }

  if (levels.length) {
    await createInventoryLevelsWorkflow(container).run({ input: { inventory_levels: levels } });
    logger.info(`[products] set ${levels.length} inventory levels at ${stockLocationId}.`);
  } else {
    logger.info('[products] no new inventory levels to set.');
  }

  logger.info('[products] done.');
}
