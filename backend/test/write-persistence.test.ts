import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { buildTenantScope } from '../src/security/tenant-scope';
import { POST as PO_POST, GET as PO_GET } from '../src/api/app/commerce/purchase-orders/route';
import { PATCH as PO_PATCH } from '../src/api/app/commerce/purchase-orders/[id]/route';
import { GET as PROMO_GET } from '../src/api/app/commerce/promotions/route';
import { PATCH as STORE_COLLECT } from '../src/api/app/store/orders/[id]/route';

/*
 * END-TO-END WRITE PERSISTENCE against a real in-memory Postgres (pg-mem) — no
 * mocks of the persistence layer, no live backend, no auth session. This invokes
 * the actual shipped route handlers and asserts rows land in the DB and read
 * back through the real GET handlers. Directly targets:
 *   #6  add-PO journey persists (create → row in purchase_orders)
 *   #1  PO status drives Orders/Fulfilment (create → approve → send lifecycle persists & lists)
 *   #3/#4 promotion persists and lists with discount for the stock table
 */

const USER = '11111111-1111-4111-8111-111111111111';
const APPROVER = '33333333-3333-4333-8333-333333333333';
const TENANT = '22222222-2222-4222-8222-222222222222';

// A buyer (commerce.manage) creates/sends; a separate approver (ppe.approve.*)
// signs — mirroring the app's separation of duties.
const buyerScope = buildTenantScope(
  { sub: USER, aal: 'aal2' }, TENANT, undefined,
  { user_id: USER, tenant_id: TENANT, site_id: null, roles: ['merchant'], capabilities: ['commerce.manage', 'commerce.read'], mfa_capabilities: ['commerce.manage'] },
);
const approverScope = buildTenantScope(
  { sub: APPROVER, aal: 'aal2' }, TENANT, undefined,
  { user_id: APPROVER, tenant_id: TENANT, site_id: null, roles: ['manager'], capabilities: ['ppe.approve.tier2', 'commerce.read'], mfa_capabilities: ['ppe.approve.tier2'] },
);

async function freshDb() {
  const mem = newDb();
  const knex = mem.adapters.createKnex();
  // Raw DDL with plain numeric/jsonb types — pg-mem doesn't parse knex's
  // decimal(8,2) precision syntax. jsonb so `lines` reads back as a real array.
  await knex.raw(`create table purchase_orders (
    id text primary key, tenant_id text not null, supplier_id text, supplier_name text,
    status text, currency text, reference text, expected_date text, lines jsonb, total numeric,
    created_by text, submitted_at timestamptz, sent_at timestamptz, sent_to text,
    approved_by text, approved_at timestamptz, approval_signature text, rejection_reason text,
    received_at timestamptz, received_lines jsonb, origin text, created_at timestamptz default now(), updated_at timestamptz
  )`);
  await knex.raw(`create table product_promotions (
    id text primary key, tenant_id text not null, product_id text, sku text, promo_type text,
    discount_pct numeric, cost_at_create numeric, price_at_create numeric, status text, end_date text,
    created_by text, acknowledged_by text, acknowledged_at timestamptz,
    created_at timestamptz default now(), updated_at timestamptz
  )`);
  await knex.raw(`create table store_orders (
    id text primary key, tenant_id text not null, reference text, buyer_name text, buyer_email text,
    company text, lines jsonb, currency text, subtotal numeric, discount numeric, total numeric,
    status text, pickup_code text, paystack_ref text, paid_at timestamptz, collected_at timestamptz,
    created_at timestamptz default now(), updated_at timestamptz
  )`);
  return knex;
}

function makeReq(knex: any, { scope, body, params }: any) {
  return {
    tenantScope: scope,
    body: body ?? {},
    params: params ?? {},
    scope: {
      resolve: (key: any) => {
        if (key === ContainerRegistrationKeys.PG_CONNECTION) return knex;
        if (key === ContainerRegistrationKeys.QUERY) return { graph: async () => ({ data: [] }) };
        throw new Error('unexpected container resolve: ' + String(key));
      },
    },
  } as any;
}

function makeRes(): any {
  return {
    statusCode: 200,
    body: null as any,
    status(c: number) { this.statusCode = c; return this; },
    json(o: any) { this.body = o; return this; },
  };
}

// ── #6 add-PO journey persists to the DB ───────────────────────────────────
test('POST /purchase-orders persists a PO row and prices it server-side', async () => {
  const knex = await freshDb();
  const res = makeRes();
  await PO_POST(makeReq(knex, { scope: buyerScope, body: {
    supplierName: 'Dromex Safety (Pty) Ltd', currency: 'ZAR', reference: 'Q3 boot restock',
    lines: [
      { sku: 'BOOT-1', name: 'Chelsea Boot', qty: 10, unitCost: 150 }, // 1500
      { sku: 'GLOVE-1', name: 'Nitrile Glove', qty: 5, unitCost: 20 }, // 100
    ],
  } }), res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.total, 1600);
  assert.equal(res.body.lineCount, 2);

  const rows = await knex('purchase_orders').where({ tenant_id: TENANT });
  assert.equal(rows.length, 1);                 // actually persisted
  assert.equal(Number(rows[0].total), 1600);
  assert.equal(rows[0].status, 'sent');         // external vendor → ready to receive
  assert.equal(rows[0].reference, 'Q3 boot restock');
  assert.equal((rows[0].lines as any[]).length, 2);
  await knex.destroy();
});

// ── #1 PO lifecycle that drives the Orders + Fulfilment tabs ────────────────
test('mine-plant PO goes create → approve → send, each transition persisting', async () => {
  const knex = await freshDb();

  // Create: a mine-plant supplier requires approval.
  const c = makeRes();
  await PO_POST(makeReq(knex, { scope: buyerScope, body: {
    supplierName: 'Kumba Iron Ore - Plant Alpha', currency: 'ZAR',
    lines: [{ sku: 'BOOT-1', name: 'Boot', qty: 4, unitCost: 250 }],
  } }), c);
  assert.equal(c.statusCode, 201);
  const poId = c.body.id;
  assert.equal(c.body.status, 'pending_approval');

  // A merchant cannot approve their own PO (separation of duties).
  const denied = makeRes();
  await PO_PATCH(makeReq(knex, { scope: buyerScope, params: { id: poId }, body: { action: 'approve' } }), denied);
  assert.equal(denied.statusCode, 403);

  // Approver signs it off.
  const appr = makeRes();
  await PO_PATCH(makeReq(knex, { scope: approverScope, params: { id: poId }, body: { action: 'approve', approverName: 'M. Dlamini', signature: 'data:sig' } }), appr);
  assert.equal(appr.statusCode, 200);
  assert.equal((await knex('purchase_orders').where({ id: poId }).first()).status, 'approved');

  // Buyer sends to supplier.
  const sent = makeRes();
  await PO_PATCH(makeReq(knex, { scope: buyerScope, params: { id: poId }, body: { action: 'send' } }), sent);
  assert.equal(sent.statusCode, 200);
  assert.equal((await knex('purchase_orders').where({ id: poId }).first()).status, 'sent');

  // GET lists it back through the real handler (what the PO/Orders/Fulfilment tabs read).
  const list = makeRes();
  await PO_GET(makeReq(knex, { scope: buyerScope }), list);
  assert.equal(list.body.orders.length, 1);
  assert.equal(list.body.orders[0].status, 'sent');
  assert.equal(list.body.orders[0].approvedBy, 'M. Dlamini');
  await knex.destroy();
});

// An invalid transition is rejected (can't send a PO still awaiting approval).
test('PATCH rejects an illegal status transition', async () => {
  const knex = await freshDb();
  const c = makeRes();
  await PO_POST(makeReq(knex, { scope: buyerScope, body: {
    supplierName: 'Sishen Mine Plant', lines: [{ sku: 'X', qty: 1, unitCost: 10 }],
  } }), c);
  const bad = makeRes();
  await PO_PATCH(makeReq(knex, { scope: buyerScope, params: { id: c.body.id }, body: { action: 'send' } }), bad);
  assert.equal(bad.statusCode, 409); // pending_approval → send is not allowed
  await knex.destroy();
});

// ── #3/#4 promotion persists and lists with discount for the stock table ────
test('GET /promotions reads persisted promos and flags expiry for the stock column', async () => {
  const knex = await freshDb();
  // Row shape exactly as POST /promotions writes it.
  await knex('product_promotions').insert([
    { id: '55555555-5555-4555-8555-555555555555', tenant_id: TENANT, product_id: 'prod_1', sku: 'BOOT-1', promo_type: 'markdown', discount_pct: 20, cost_at_create: 100, price_at_create: 250, status: 'active', end_date: '2999-01-01', created_by: USER, created_at: new Date(), updated_at: new Date() },
    { id: '66666666-6666-4666-8666-666666666666', tenant_id: TENANT, product_id: 'prod_2', sku: 'GLOVE-1', promo_type: 'focus', discount_pct: 10, cost_at_create: 20, price_at_create: 50, status: 'active', end_date: '2000-01-01', created_by: USER, created_at: new Date(), updated_at: new Date() },
  ]);

  const res = makeRes();
  await PROMO_GET(makeReq(knex, { scope: buyerScope }), res);
  const promos = res.body.promotions;
  assert.equal(promos.length, 2);
  const boot = promos.find((p: any) => p.sku === 'BOOT-1');
  assert.equal(boot.discountPct, 20);
  assert.equal(boot.promoType, 'markdown');
  assert.equal(boot.expired, false);
  const glove = promos.find((p: any) => p.sku === 'GLOVE-1');
  assert.equal(glove.expired, true);       // past end_date → surfaces as expired
  assert.equal(glove.status, 'expired');
  await knex.destroy();
});

// ── Store pickup is code-gated: no release without the contractor's code ─────
async function seedPaidStoreOrder(knex: any) {
  await knex('store_orders').insert({
    id: 'so_1', tenant_id: TENANT, reference: 'STORE-1001', buyer_name: 'ACME Contractors',
    total: 430, currency: 'ZAR', status: 'paid', pickup_code: 'PU-ABC123', paid_at: new Date(), created_at: new Date(), updated_at: new Date(),
  });
}

test('store collect is REFUSED when no pickup code is entered', async () => {
  const knex = await freshDb();
  await seedPaidStoreOrder(knex);
  const res = makeRes();
  await STORE_COLLECT(makeReq(knex, { scope: buyerScope, params: { id: 'so_1' }, body: {} }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'pickup_code_required');
  // Still paid — nothing released.
  assert.equal((await knex('store_orders').where({ id: 'so_1' }).first()).status, 'paid');
  await knex.destroy();
});

test('store collect is REFUSED when the pickup code does not match', async () => {
  const knex = await freshDb();
  await seedPaidStoreOrder(knex);
  const res = makeRes();
  await STORE_COLLECT(makeReq(knex, { scope: buyerScope, params: { id: 'so_1' }, body: { pickupCode: 'PU-WRONG9' } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'bad_pickup_code');
  assert.equal((await knex('store_orders').where({ id: 'so_1' }).first()).status, 'paid');
  await knex.destroy();
});

test('store collect SUCCEEDS only with the exact released code (case-insensitive)', async () => {
  const knex = await freshDb();
  await seedPaidStoreOrder(knex);
  const res = makeRes();
  await STORE_COLLECT(makeReq(knex, { scope: buyerScope, params: { id: 'so_1' }, body: { pickupCode: ' pu-abc123 ' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'collected');
  const row = await knex('store_orders').where({ id: 'so_1' }).first();
  assert.equal(row.status, 'collected');
  assert.ok(row.collected_at);
  await knex.destroy();
});
