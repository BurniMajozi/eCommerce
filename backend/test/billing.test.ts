import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCharge, currentPeriod, invoiceToApi } from '../src/lib/billing';

test('trial is free regardless of seats', () => {
  const c = computeCharge('trial', 500);
  assert.equal(c.total, 0);
  assert.equal(c.base, 0);
});

test('merchant is a flat R990 with no per-seat overage', () => {
  const c = computeCharge('merchant', 5000);
  assert.equal(c.base, 990);
  assert.equal(c.seatAmount, 0);
  assert.equal(c.total, 990);
});

test('plant meters R250/seat over 200', () => {
  const under = computeCharge('plant', 180);
  assert.equal(under.total, 5900); // no overage under 200
  const over = computeCharge('plant', 250);
  assert.equal(over.seatOverage, 50);
  assert.equal(over.seatAmount, 12500); // 50 * 250
  assert.equal(over.total, 18400); // 5900 + 12500
});

test('group meters R150/seat over 200', () => {
  const c = computeCharge('group', 300);
  assert.equal(c.seatOverage, 100);
  assert.equal(c.seatAmount, 15000); // 100 * 150
  assert.equal(c.total, 39900); // 24900 + 15000
});

test('unknown plan and bad seat counts degrade to trial / zero', () => {
  assert.equal(computeCharge('mystery', 10).total, 0);
  assert.equal(computeCharge('plant', -5).seats, 0);
  assert.equal(computeCharge('plant', 5.9).seats, 5);
});

test('currentPeriod is YYYY-MM', () => {
  assert.match(currentPeriod(), /^\d{4}-\d{2}$/);
});

test('invoiceToApi maps snake_case rows to camelCase', () => {
  const api = invoiceToApi({ id: 'i1', tenant_id: 't1', tenant_name: 'Kumba', period: '2026-08', plan: 'plant', seats: 250, base_amount: 5900, seat_amount: 12500, total: 18400, currency: 'ZAR', status: 'issued', paystack_ref: null, payer_email: null, issued_at: 'x', paid_at: null });
  assert.equal(api.tenantName, 'Kumba');
  assert.equal(api.total, 18400);
  assert.equal(api.status, 'issued');
});
