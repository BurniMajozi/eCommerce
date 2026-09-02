import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveOrderTotal } from '../src/lib/reporting';

test('missing order totals remain unknown instead of inventing revenue', () => {
  assert.equal(resolveOrderTotal(undefined, {}), null);
  assert.equal(resolveOrderTotal(0, { total: 0 }), null);
});

test('order total prefers the persisted order then its metadata', () => {
  assert.equal(resolveOrderTotal(1250, { total: 900 }), 1250);
  assert.equal(resolveOrderTotal(null, { total: 900 }), 900);
});
