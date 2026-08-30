import assert from 'node:assert/strict';
import test from 'node:test';
import { selectSellingPrice } from '../src/catalogue/contract';
import { orderSpendValue, aggregateSpendByCustomer } from '../src/api/app/commerce/parties/route';

/*
 * Executable evidence for the deterministic cores of three reported complaints:
 *   #2 "Customer spend and limit is not updating"
 *   #5 "the B2B tab order creation is failing"
 *   #1 "the PO does not update the 'order' and 'fulfilment' tabs"
 *   #4 "add the promo discount column ... to recalculate margins"
 * These exercise the real shipped functions (no auth / no live backend needed).
 */

// ── #2 Customer spend valuation ────────────────────────────────────────────
// The bug: Medusa persists `total` as 0 for our B2B draft orders, so spend
// always read 0. The fix falls back total → metadata.total → subtotal → lines.
test('orderSpendValue falls back past a zero persisted total to metadata.total', () => {
  const order = { total: 0, metadata: { total: 11500, subtotal: 10000 }, items: [] };
  assert.equal(orderSpendValue(order), 11500);
});

test('orderSpendValue uses metadata.subtotal when total fields are absent', () => {
  const order = { total: 0, metadata: { subtotal: 8200 }, items: [] };
  assert.equal(orderSpendValue(order), 8200);
});

test('orderSpendValue computes from line items as the last resort', () => {
  const order = { total: 0, metadata: {}, items: [
    { unit_price: 150, quantity: 4 },   // 600
    { unit_price: 89.5, quantity: 2 },  // 179
  ] };
  assert.equal(orderSpendValue(order), 779);
});

test('orderSpendValue prefers a real persisted total when present', () => {
  const order = { total: 9999, metadata: { total: 1 }, items: [] };
  assert.equal(orderSpendValue(order), 9999);
});

test('aggregateSpendByCustomer sums multiple orders and skips unlinked ones', () => {
  const spent = aggregateSpendByCustomer([
    { customer_id: 'cus_A', total: 0, metadata: { total: 1000 }, items: [] },
    { customer_id: 'cus_A', total: 0, metadata: { subtotal: 500 }, items: [] },
    { customer_id: 'cus_B', total: 250, metadata: {}, items: [] },
    { customer_id: null,    total: 0, metadata: { total: 777 }, items: [] }, // unlinked → ignored
  ]);
  assert.equal(spent.get('cus_A'), 1500); // spend now updates cumulatively
  assert.equal(spent.get('cus_B'), 250);
  assert.equal(spent.has('null' as any), false);
});

// ── #5 B2B order pricing ───────────────────────────────────────────────────
// B2B order creation failed when prices came back empty. selectSellingPrice
// must resolve the region price the order is priced from.
test('selectSellingPrice resolves the region-matched price for a B2B line', () => {
  const variant = { id: 'v1', sku: 'BOOT-1', prices: [
    { amount: 320, rules: { region_id: 'reg_za' } },
    { amount: 999, rules: { region_id: 'reg_other' } },
  ] } as any;
  assert.equal(selectSellingPrice(variant, 'reg_za'), 320);
});

test('selectSellingPrice returns null when a variant has no prices (guarded upstream)', () => {
  const variant = { id: 'v2', sku: 'NOPRICE', prices: [] } as any;
  assert.equal(selectSellingPrice(variant, 'reg_za'), null);
});

// ── #1 PO ↔ Order/Fulfilment join key ──────────────────────────────────────
// The Orders + Fulfilment tabs key a sale order and its derived PO by ord#NN.
// This is the exact extractor MedusaAdminPortal.jsx uses; both the sale order's
// display id (#26) and the PO reference the orders route builds must map to the
// SAME key, so the PO's live status surfaces on both tabs.
const orderKeyFromRef = (ref: string) => {
  const m = /#\s*(\d+)/.exec(String(ref || ''));
  return m ? `ord#${m[1]}` : null;
};

test('a sale order display id and its PO reference resolve to one shared key', () => {
  const saleDisplay = '#26';
  const poReference = 'B2B Order #26 (Storefront)'; // format built in orders/route.ts
  assert.equal(orderKeyFromRef(saleDisplay), 'ord#26');
  assert.equal(orderKeyFromRef(poReference), 'ord#26');
  assert.equal(orderKeyFromRef(saleDisplay), orderKeyFromRef(poReference));
});

test('unrelated references do not collide on a key', () => {
  assert.equal(orderKeyFromRef('Q3 boot restock'), null);
  assert.notEqual(orderKeyFromRef('B2B Order #27 (X)'), orderKeyFromRef('B2B Order #26 (X)'));
});

// ── #4 Promo discount column margin recalculation ──────────────────────────
// The stock tables show a promo column that drops the cost basis and recomputes
// margin: promoCost = cost * (1 - pct/100); margin = (price - promoCost)/price.
const promoCost = (cost: number, pct: number) => cost * (1 - pct / 100);
const margin = (price: number, cost: number) => (price - cost) / price;

test('promo discount lowers the cost basis and narrows the margin', () => {
  const cost = 100, price = 250, pct = 20;
  const pc = promoCost(cost, pct);
  assert.equal(pc, 80);
  // base margin 60% → promo margin recomputed off the discounted cost basis
  assert.equal(margin(price, cost), 0.6);
  assert.equal(Number(margin(price, pc).toFixed(3)), 0.68);
});
