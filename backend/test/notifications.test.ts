import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { buildTenantScope } from '../src/security/tenant-scope';
import { emitNotifications } from '../src/api/app/notifications/emit';
import { GET as NOTIF_GET } from '../src/api/app/notifications/route';
import { PATCH as NOTIF_PATCH } from '../src/api/app/notifications/[id]/route';
import { POST as READ_ALL } from '../src/api/app/notifications/read-all/route';

/*
 * Fan-out notifications against pg-mem: emit inserts one row per recipient; each
 * user reads only their own rows and their own unread count; marking read is
 * scoped to the caller.
 */

const TENANT = '22222222-2222-4222-8222-222222222222';
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '33333333-3333-4333-8333-333333333333';
const member = (uid: string) => buildTenantScope(
  { sub: uid, aal: 'aal2' }, TENANT, undefined,
  { user_id: uid, tenant_id: TENANT, site_id: null, roles: ['worker'], capabilities: ['ppe.request.create'], mfa_capabilities: [] },
);

async function freshDb() {
  const mem = newDb();
  const knex = mem.adapters.createKnex();
  await knex.raw(`create table notifications (
    id text primary key, tenant_id text not null, site_id text, recipient_user_id text not null,
    type text not null, title text not null, body text, severity text not null default 'info',
    link_role text, link_id text, read_at timestamptz, created_by text,
    metadata jsonb not null default '{}', created_at timestamptz not null default now()
  )`);
  return knex;
}
function makeReq(knex: any, { scope, body, params, query }: any) {
  return {
    tenantScope: scope, body: body ?? {}, params: params ?? {}, query: query ?? {},
    scope: { resolve: (k: any) => { if (k === ContainerRegistrationKeys.PG_CONNECTION) return knex; throw new Error('unexpected resolve'); } },
  } as any;
}
function makeRes(): any {
  return { statusCode: 200, body: null as any, status(c: number) { this.statusCode = c; return this; }, json(o: any) { this.body = o; return this; } };
}

test('emit fans out one row per recipient and excludes the actor', async () => {
  const knex = await freshDb();
  const n = await emitNotifications(knex, {
    tenantId: TENANT, recipientUserIds: [U1, U2, U1], type: 'safety_alert', title: 'Gas leak', body: 'Evacuate',
    severity: 'critical', linkRole: 'SAFETY_ALERTS', excludeUserId: U2,
  });
  assert.equal(n, 1); // U2 excluded, U1 de-duped → only U1
  assert.equal((await knex('notifications').where({ recipient_user_id: U1 })).length, 1);
  assert.equal((await knex('notifications').where({ recipient_user_id: U2 })).length, 0);
  await knex.destroy();
});

test('each user reads only their own notifications and unread count', async () => {
  const knex = await freshDb();
  await emitNotifications(knex, { tenantId: TENANT, recipientUserIds: [U1, U2], type: 'safety_alert', title: 'Alert A', severity: 'warning' });
  await emitNotifications(knex, { tenantId: TENANT, recipientUserIds: [U1], type: 'escalation', title: 'Escalation B', severity: 'warning' });

  const r1 = makeRes();
  await NOTIF_GET(makeReq(knex, { scope: member(U1) }), r1);
  assert.equal(r1.body.notifications.length, 2);
  assert.equal(r1.body.unreadCount, 2);

  const r2 = makeRes();
  await NOTIF_GET(makeReq(knex, { scope: member(U2) }), r2);
  assert.equal(r2.body.notifications.length, 1);
  assert.equal(r2.body.unreadCount, 1);
  await knex.destroy();
});

test('marking one read, and read-all, only affect the caller', async () => {
  const knex = await freshDb();
  await emitNotifications(knex, { tenantId: TENANT, recipientUserIds: [U1, U2], type: 'safety_alert', title: 'Shared', severity: 'info' });
  await emitNotifications(knex, { tenantId: TENANT, recipientUserIds: [U1], type: 'ack', title: 'Second', severity: 'success' });
  const mine = await knex('notifications').where({ recipient_user_id: U1 });

  // U1 marks one read.
  const one = makeRes();
  await NOTIF_PATCH(makeReq(knex, { scope: member(U1), params: { id: mine[0].id } }), one);
  assert.equal(one.body.read, true);

  // U2 cannot mark U1's notification (scoped by recipient) → 404.
  const denied = makeRes();
  await NOTIF_PATCH(makeReq(knex, { scope: member(U2), params: { id: mine[1].id } }), denied);
  assert.equal(denied.statusCode, 404);

  // U1 read-all clears the rest for U1 only.
  const all = makeRes();
  await READ_ALL(makeReq(knex, { scope: member(U1) }), all);
  const r1 = makeRes();
  await NOTIF_GET(makeReq(knex, { scope: member(U1) }), r1);
  assert.equal(r1.body.unreadCount, 0);
  const r2 = makeRes();
  await NOTIF_GET(makeReq(knex, { scope: member(U2) }), r2);
  assert.equal(r2.body.unreadCount, 1); // U2 untouched
  await knex.destroy();
});
