import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCatalogueContract, buildProfitContract, collectInventoryItemIds } from '../src/catalogue/contract';

const context = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  siteId: '22222222-2222-4222-8222-222222222222',
  salesChannelId: 'sc_test',
  stockLocationId: 'sloc_site_a',
  regionId: 'reg_za',
};

test('maps Medusa product, region price and only the requested stock location', () => {
  const products = [{
    id: 'prod_1',
    title: 'Safety Boot',
    description: 'PPE boot',
    categories: [{ name: 'Footwear' }],
    metadata: { abc_class: 'A', lifespan_months: 12, daily_consumption: 1.5, lead_time_days: 7 },
    variants: [{
      id: 'variant_1',
      title: 'Size 9',
      sku: 'BOOT-9',
      metadata: { cost_price: 700 },
      prices: [
        { amount: 999, currency_code: 'zar', rules: { region_id: 'reg_other' } },
        { amount: 1080, currency_code: 'zar', rules: { region_id: 'reg_za' } },
      ],
      inventory_items: [{ inventory_item_id: 'iitem_1', required_quantity: 1 }],
    }],
  }];
  const levels = [
    { inventory_item_id: 'iitem_1', location_id: 'sloc_site_a', stocked_quantity: 12, reserved_quantity: 2, incoming_quantity: 3 },
    { inventory_item_id: 'iitem_1', location_id: 'sloc_other', stocked_quantity: 900, reserved_quantity: 0, incoming_quantity: 0 },
  ];

  const response = buildCatalogueContract(products, levels, context);

  assert.equal(response.items[0].sellingPrice, 1080);
  assert.equal('costPrice' in response.items[0], false);
  assert.equal(JSON.stringify(response).includes('cost_price'), false);
  assert.equal(response.items[0].stockOnHand, 12);
  assert.equal(response.items[0].stockAvailable, 10);
  assert.equal(response.items[0].stockInTransit, 3);
  assert.equal(response.items[0].dataQuality.complete, true);
});

test('reports missing commerce fields instead of inventing business values', () => {
  const response = buildCatalogueContract([{ id: 'prod_empty', title: 'Incomplete', variants: [] }], [], context);

  assert.equal(response.items[0].sellingPrice, 0);
  assert.deepEqual(response.items[0].dataQuality.missing, ['sku', 'selling_price', 'site_inventory']);
  assert.equal(response.dataQuality.complete, false);
});

test('calculates private profitability separately from the generic catalogue', () => {
  const products = [{
    id: 'prod_1',
    title: 'Safety Boot',
    variants: [{
      id: 'variant_1',
      sku: 'BOOT-9',
      metadata: { cost_price: 700 },
      prices: [{ amount: 1080, rules: { region_id: 'reg_za' } }],
      inventory_items: [{ inventory_item_id: 'iitem_1', required_quantity: 1 }],
    }],
  }];
  const levels = [{ inventory_item_id: 'iitem_1', location_id: 'sloc_site_a', stocked_quantity: 12, reserved_quantity: 2 }];

  const response = buildProfitContract(products, levels, context);

  assert.equal(response.items[0].averageCost, 700);
  assert.equal(response.items[0].stockCostValue, 8_400);
  assert.equal(response.items[0].stockRetailValue, 12_960);
  assert.equal(response.items[0].potentialProfit, 4_560);
  assert.equal(response.items[0].marginPercent, (4_560 / 12_960) * 100);
});

test('collects unique inventory item ids for a location-filtered service query', () => {
  const products = [{
    id: 'prod_1',
    variants: [
      { inventory_items: [{ inventory_item_id: 'iitem_1' }, { inventory_item_id: 'iitem_2' }] },
      { inventory_items: [{ inventory_item_id: 'iitem_1' }] },
    ],
  }];

  assert.deepEqual(collectInventoryItemIds(products), ['iitem_1', 'iitem_2']);
});
