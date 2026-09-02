import assert from 'node:assert/strict';
import test from 'node:test';
import { sendEmail, isEmailEnabled } from '../src/lib/agentmail';
import {
  money, inviteEmail, poDecisionEmail, requestDecisionEmail,
  saleConfirmationEmail, promoEmail, purchaseOrderEmail, invoiceEmail,
} from '../src/lib/email-templates';
import { POST as EMAIL_POST } from '../src/api/app/notifications/email/route';
import { buildTenantScope } from '../src/security/tenant-scope';

// Ensure a clean, unconfigured environment for the no-op assertions.
delete process.env.AGENTMAIL_API_KEY;
delete process.env.AGENTMAIL_INBOX_ID;

// ── Service safely no-ops until env is provisioned ──────────────────────────
test('email is disabled and sendEmail no-ops when env is unset', async () => {
  assert.equal(isEmailEnabled(), false);
  const r = await sendEmail({ to: 'a@b.com', subject: 's', html: '<p>x</p>' });
  assert.deepEqual(r, { sent: false, skipped: true });
});

// ── money() formats per currency ────────────────────────────────────────────
test('money prefixes the right symbol per currency (en-ZA locale)', () => {
  assert.ok(money(1600, 'ZAR').startsWith('R ') && money(1600, 'ZAR').includes('600'));
  assert.ok(money(41220, 'BWP').startsWith('P '));
  assert.ok(money(88400, 'NAD').startsWith('N$ '));
});

// ── Every template produces a subject + well-formed, on-brand HTML ──────────
const wellFormed = (html: string) => html.startsWith('<!doctype html>') && html.includes('SightLive') && !/undefined/.test(html);

test('invite (auth) template carries credentials and login', () => {
  const c = inviteEmail({ name: 'Jane', email: 'jane@mine.co.za', role: 'manager', tempPassword: 'Temp123!', loginUrl: 'https://app.test' });
  assert.match(c.subject, /account is ready/i);
  assert.ok(wellFormed(c.html));
  assert.ok(c.html.includes('Temp123!') && c.html.includes('jane@mine.co.za') && c.html.includes('https://app.test'));
});

test('PO decision (approvals) reflects the decision + reference', () => {
  const ok = poDecisionEmail({ reference: '#26', decision: 'approved', supplier: 'Dromex', approver: 'M. Dlamini', total: 1600, currency: 'ZAR' });
  assert.match(ok.subject, /approved/i);
  assert.ok(ok.html.includes('#26') && ok.html.includes('Dromex') && ok.html.includes(money(1600,'ZAR')));
  const no = poDecisionEmail({ reference: '#27', decision: 'rejected', reason: 'Over budget' });
  assert.match(no.subject, /rejected/i);
  assert.ok(no.html.includes('Over budget'));
});

test('PPE request decision (approvals) includes pickup code when approved', () => {
  const c = requestDecisionEmail({ employeeName: 'Ndlovu', itemName: 'Gloves', decision: 'approved', pickupCode: '1042' });
  assert.ok(wellFormed(c.html));
  assert.ok(c.html.includes('1042') && c.html.includes('Gloves'));
});

test('sale confirmation (sales) shows total and store pickup code', () => {
  const c = saleConfirmationEmail({ reference: 'STORE-1', buyerName: 'ACME', kind: 'store', lines: [{ name: 'Boot', sku: 'B1', qty: 2, unitPrice: 150 }], subtotal: 300, total: 300, currency: 'ZAR', pickupCode: 'PU-ABC123' });
  assert.ok(wellFormed(c.html));
  assert.ok(c.html.includes('STORE-1') && c.html.includes('PU-ABC123') && c.html.includes(money(300,'ZAR')));
});

test('promo (promos) shows discount and recomputed cost basis', () => {
  const c = promoEmail({ sku: 'B1', name: 'Boot', promoType: 'markdown', discountPct: 20, costWas: 100, costNow: 80, currency: 'ZAR' });
  assert.match(c.subject, /new promotion/i);
  assert.ok(c.html.includes('−20%') && c.html.includes(money(100,'ZAR')) && c.html.includes(money(80,'ZAR')));
});

test('purchase order (PO) lists lines and total for the supplier', () => {
  const c = purchaseOrderEmail({ reference: 'PO-1', supplier: 'Dromex', lines: [{ name: 'Boot', sku: 'B1', qty: 10, unit_cost: 150 }], total: 1500, currency: 'ZAR' });
  assert.ok(wellFormed(c.html));
  assert.ok(c.html.includes('Dromex') && c.html.includes('B1') && c.html.includes(money(1500,'ZAR')));
});

test('invoice template shows totals and VAT for the customer', () => {
  const c = invoiceEmail({ number: 'INV-9', clientName: 'ACME', lines: [{ name: 'Boot', sku: 'B1', qty: 4, unitPrice: 250 }], subtotal: 1000, vat: 150, total: 1150, currency: 'ZAR' });
  assert.ok(wellFormed(c.html));
  assert.ok(c.html.includes('INV-9') && c.html.includes(money(1150,'ZAR')) && c.html.includes(money(150,'ZAR')));
});

// ── Notifications endpoint validation ───────────────────────────────────────
const TENANT = '22222222-2222-4222-8222-222222222222';
const scope = buildTenantScope(
  { sub: '11111111-1111-4111-8111-111111111111', aal: 'aal2' }, TENANT, undefined,
  { user_id: '11111111-1111-4111-8111-111111111111', tenant_id: TENANT, site_id: null, roles: ['merchant'], capabilities: ['commerce.manage'], mfa_capabilities: [] },
);
const readOnlyScope = buildTenantScope(
  { sub: '11111111-1111-4111-8111-111111111111', aal: 'aal2' }, TENANT, undefined,
  { user_id: '11111111-1111-4111-8111-111111111111', tenant_id: TENANT, site_id: null, roles: ['worker'], capabilities: ['commerce.read'], mfa_capabilities: [] },
);
const aal1Scope = buildTenantScope(
  { sub: '11111111-1111-4111-8111-111111111111', aal: 'aal1' }, TENANT, undefined,
  { user_id: '11111111-1111-4111-8111-111111111111', tenant_id: TENANT, site_id: null, roles: ['merchant'], capabilities: ['commerce.manage'], mfa_capabilities: ['commerce.manage'] },
);
const makeReq = (body: any) => ({ tenantScope: scope, body }) as any;
const makeRes = (): any => ({ statusCode: 200, body: null as any, status(c: number) { this.statusCode = c; return this; }, json(o: any) { this.body = o; return this; } });

test('endpoint rejects an unknown template', async () => {
  const res = makeRes();
  await EMAIL_POST(makeReq({ template: 'nope', recordId: 'order_1' }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'unknown_template');
});

test('endpoint rejects arbitrary recipients and requires a tenant-owned record', async () => {
  const res = makeRes();
  await EMAIL_POST(makeReq({ template: 'invoice', to: 'outside@example.com', data: { total: 999999 } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'notification_record_required');
});

test('endpoint reports skipped when email is not configured', async () => {
  const res = makeRes();
  await EMAIL_POST(makeReq({ template: 'invoice', recordId: 'order_1' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.skipped, true);
});

test('endpoint denies read-only users and requires MFA for commerce managers', async () => {
  const readOnly = makeRes();
  await EMAIL_POST(({ tenantScope: readOnlyScope, body: { template: 'invoice', recordId: 'order_1' } }) as any, readOnly);
  assert.equal(readOnly.statusCode, 403);
  assert.equal(readOnly.body.code, 'capability_required');

  const aal1 = makeRes();
  await EMAIL_POST(({ tenantScope: aal1Scope, body: { template: 'invoice', recordId: 'order_1' } }) as any, aal1);
  assert.equal(aal1.statusCode, 403);
  assert.equal(aal1.body.code, 'mfa_required');
});
