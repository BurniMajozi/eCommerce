import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { buildTenantScope } from '../src/security/tenant-scope';
import { POST as PO_POST } from '../src/api/app/commerce/purchase-orders/route';
import { GET as TICKETS_GET, POST as TICKETS_POST } from '../src/api/app/tickets/route';
import { PATCH as TICKET_PATCH } from '../src/api/app/tickets/[id]/route';
import { POST as NOTE_POST } from '../src/api/app/tickets/[id]/notes/route';
import { PATCH as NOTE_PATCH, DELETE as NOTE_DELETE } from '../src/api/app/tickets/[id]/notes/[noteId]/route';
import { POST as ALERT_POST } from '../src/api/app/safety/alerts/route';

/*
 * The Safety App ticket layer against a real in-memory Postgres (pg-mem). Runs
 * the shipped handlers: a PO materialises into a ticket with a common key; the
 * approver resolves the ticket which drives the real PO approval; a safety
 * incident is raised; and a note goes through create → edit → delete.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const APPROVER = '33333333-3333-4333-8333-333333333333';
const TENANT = '22222222-2222-4222-8222-222222222222';

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
  await knex.raw(`create table purchase_orders (
    id text primary key, tenant_id text not null, supplier_id text, supplier_name text,
    status text, currency text, reference text, expected_date text, lines jsonb, total numeric,
    created_by text, submitted_at timestamptz, sent_at timestamptz, sent_to text,
    approved_by text, approved_at timestamptz, approval_signature text, rejection_reason text,
    received_at timestamptz, received_lines jsonb, origin text, created_at timestamptz default now(), updated_at timestamptz
  )`);
  await knex.raw(`create table store_orders (
    id text primary key, tenant_id text not null, reference text, buyer_name text, company text,
    lines jsonb, currency text, total numeric, status text, pickup_code text, created_by text,
    created_at timestamptz default now(), updated_at timestamptz
  )`);
  await knex.raw(`create table tickets (
    id text primary key, tenant_id text not null, site_id text, seq bigint not null, common_key text not null,
    category text not null, trigger text, source_type text, source_id text, reference text, subject text,
    status text not null default 'open', priority text not null default 'normal', value numeric, currency text default 'ZAR',
    escalated boolean not null default false, escalated_at timestamptz, escalated_by text,
    resolved_at timestamptz, resolved_by text, created_by text, assigned_to text,
    metadata jsonb not null default '{}', created_at timestamptz default now(), updated_at timestamptz default now()
  )`);
  await knex.raw(`create table ticket_notes (
    id text primary key, ticket_id text not null, tenant_id text not null, body text not null,
    author_user_id text, author_name text, created_at timestamptz default now(), updated_at timestamptz default now()
  )`);
  return knex;
}

function makeReq(knex: any, { scope, body, params, query }: any) {
  return {
    tenantScope: scope, body: body ?? {}, params: params ?? {}, query: query ?? {},
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
  return { statusCode: 200, body: null as any, status(c: number) { this.statusCode = c; return this; }, json(o: any) { this.body = o; return this; } };
}

test('a purchase order materialises into a ticket with a common key', async () => {
  const knex = await freshDb();
  const poRes = makeRes();
  await PO_POST(makeReq(knex, { scope: buyerScope, body: { supplierName: 'CageLi Manufacturing', currency: 'ZAR', lines: [{ sku: 'BOOT-1', name: 'Boots', qty: 4, unitCost: 250 }] } }), poRes);
  await knex('purchase_orders').update({ status: 'pending_approval' });

  const list = makeRes();
  await TICKETS_GET(makeReq(knex, { scope: buyerScope }), list);
  const tickets = list.body.tickets;
  assert.equal(tickets.length, 1);
  assert.equal(tickets[0].category, 'purchase_order');
  assert.equal(tickets[0].commonKey, 'SL-PO-00001');
  assert.equal(tickets[0].status, 'pending_approval');
  await knex.destroy();
});

test('resolving a PO ticket drives the real PO approval and logs a system note', async () => {
  const knex = await freshDb();
  const poRes = makeRes();
  await PO_POST(makeReq(knex, { scope: buyerScope, body: { supplierName: 'Majozi PPE', currency: 'ZAR', lines: [{ sku: 'GLOVE-1', name: 'Gloves', qty: 10, unitCost: 40 }] } }), poRes);
  const poId = poRes.body.id;
  await knex('purchase_orders').update({ status: 'pending_approval' });

  const list = makeRes();
  await TICKETS_GET(makeReq(knex, { scope: approverScope }), list);
  const ticket = list.body.tickets[0];

  const done = makeRes();
  await TICKET_PATCH(makeReq(knex, { scope: approverScope, params: { id: ticket.id }, body: { action: 'resolve', decision: 'approve', approverName: 'M. Dlamini' } }), done);
  assert.equal(done.body.ticket.status, 'approved');
  assert.equal(done.body.ticket.escalated, false);
  // The underlying PO is now approved (the approval journey completed).
  assert.equal((await knex('purchase_orders').where({ id: poId }).first()).status, 'approved');
  // A system note recorded the decision.
  const notes = await knex('ticket_notes').where({ ticket_id: ticket.id });
  assert.ok(notes.some((n: any) => /Approved by M. Dlamini/.test(n.body)));
  await knex.destroy();
});

test('a buyer cannot approve a regular PO ticket (separation of duties)', async () => {
  const knex = await freshDb();
  const poRes = makeRes();
  await PO_POST(makeReq(knex, { scope: buyerScope, body: { supplierName: 'CageLi Manufacturing', currency: 'ZAR', lines: [{ sku: 'BOOT-1', name: 'Boots', qty: 1, unitCost: 100 }] } }), poRes);
  await knex('purchase_orders').update({ status: 'pending_approval' });
  const list = makeRes();
  await TICKETS_GET(makeReq(knex, { scope: buyerScope }), list);
  const ticket = list.body.tickets[0];
  const res = makeRes();
  await TICKET_PATCH(makeReq(knex, { scope: buyerScope, params: { id: ticket.id }, body: { action: 'resolve', decision: 'approve' } }), res);
  assert.equal(res.statusCode, 403);
  assert.equal((await knex('purchase_orders').where({ id: poRes.body.id }).first()).status, 'pending_approval');
  await knex.destroy();
});

test('a safety incident can be raised and its notes go through create → edit → delete', async () => {
  const knex = await freshDb();
  const created = makeRes();
  await TICKETS_POST(makeReq(knex, { scope: buyerScope, body: { category: 'safety_incident', subject: 'Missing hand rail L3', priority: 'critical', note: 'Reported by shift lead' } }), created);
  assert.equal(created.statusCode, 201);
  const t = created.body.ticket;
  assert.equal(t.category, 'safety_incident');
  assert.equal(t.commonKey, 'SL-SAF-00001');

  // Opening note persisted.
  let notes = await knex('ticket_notes').where({ ticket_id: t.id });
  assert.equal(notes.length, 1);

  // Create a note.
  const noteRes = makeRes();
  await NOTE_POST(makeReq(knex, { scope: buyerScope, params: { id: t.id }, body: { body: 'Barrier placed, awaiting fix' } }), noteRes);
  assert.equal(noteRes.statusCode, 201);
  const noteId = noteRes.body.note.id;

  // Edit it.
  const edited = makeRes();
  await NOTE_PATCH(makeReq(knex, { scope: buyerScope, params: { id: t.id, noteId }, body: { body: 'Barrier placed; contractor booked' } }), edited);
  assert.match(edited.body.note.body, /contractor booked/);

  // Delete it.
  const del = makeRes();
  await NOTE_DELETE(makeReq(knex, { scope: buyerScope, params: { id: t.id, noteId } }), del);
  assert.equal(del.body.deleted, true);
  notes = await knex('ticket_notes').where({ ticket_id: t.id });
  assert.equal(notes.length, 1); // only the opening note remains
  await knex.destroy();
});

test('a safety report can be escalated and a manager acknowledges it', async () => {
  const knex = await freshDb();
  const created = makeRes();
  await TICKETS_POST(makeReq(knex, { scope: buyerScope, body: { category: 'safety_incident', subject: 'Exposed cable L3', priority: 'high', imageUrl: 'data:image/jpeg;base64,AAAA' } }), created);
  const t = created.body.ticket;
  // Photo stored, but stripped from the list read.
  assert.equal((await knex('tickets').where({ id: t.id }).first()).metadata.imageUrl, 'data:image/jpeg;base64,AAAA');

  // Anyone can escalate.
  const esc = makeRes();
  await TICKET_PATCH(makeReq(knex, { scope: buyerScope, params: { id: t.id }, body: { action: 'escalate' } }), esc);
  assert.equal(esc.body.ticket.escalated, true);

  // A buyer (commerce.manage) may NOT acknowledge — that's a manager action.
  const denied = makeRes();
  await TICKET_PATCH(makeReq(knex, { scope: buyerScope, params: { id: t.id }, body: { action: 'acknowledge' } }), denied);
  assert.equal(denied.statusCode, 403);

  // The manager (approver) acknowledges.
  const ack = makeRes();
  await TICKET_PATCH(makeReq(knex, { scope: approverScope, params: { id: t.id }, body: { action: 'acknowledge', approverName: 'S. Manager' } }), ack);
  assert.equal(ack.body.ticket.status, 'acknowledged');
  assert.equal(ack.body.ticket.metadata.acknowledgedBy, 'S. Manager');
  await knex.destroy();
});

test('only a manager can broadcast a safety alert, and it becomes a safety_alert ticket', async () => {
  const knex = await freshDb();
  // Buyer cannot send.
  const denied = makeRes();
  await ALERT_POST(makeReq(knex, { scope: buyerScope, body: { title: 'Test', message: 'x' } }), denied);
  assert.equal(denied.statusCode, 403);

  // Manager sends → safety_alert ticket with an ALERT common key.
  const sent = makeRes();
  await ALERT_POST(makeReq(knex, { scope: approverScope, body: { title: 'Gas leak — evacuate Shaft 4', severity: 'critical', message: 'Evacuate now', plants: ['Plant Alpha'], departments: ['Underground'], sentByName: 'S. Manager' } }), sent);
  assert.equal(sent.statusCode, 201);
  assert.match(sent.body.alert.commonKey, /^SL-ALERT-\d{5}$/);
  const row = await knex('tickets').where({ category: 'safety_alert' }).first();
  assert.equal(row.subject, 'Gas leak — evacuate Shaft 4');
  assert.equal(row.priority, 'critical');
  assert.equal(row.metadata.audience, 'Plant Alpha, Underground');
  await knex.destroy();
});
