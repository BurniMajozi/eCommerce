import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveActiveRole } from '../src/navigation/activeRole.js';

test('keeps the selected view when it is permitted', () => {
  assert.equal(resolveActiveRole('MED_PRODUCTS', ['MED_PRODUCTS', 'OWNER']), 'MED_PRODUCTS');
});

test('selects the first permitted view before paint when the default is hidden', () => {
  assert.equal(resolveActiveRole('EMPLOYEE', ['MED_PRODUCTS', 'MED_ORDERS']), 'MED_PRODUCTS');
});

test('returns no view when access contains no visible navigation targets', () => {
  assert.equal(resolveActiveRole('EMPLOYEE', []), null);
});
