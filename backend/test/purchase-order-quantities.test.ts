import assert from 'node:assert/strict';
import test from 'node:test';
import { applyQualityReturns, buildReceivedLines, PurchaseOrderQuantityError } from '../src/commerce/purchase-order-quantities';

const ordered = [{ sku: 'BOOT-1', qty: 10, unit_cost: 100 }];

test('damaged quantity cannot exceed received quantity', () => {
  assert.throws(
    () => buildReceivedLines(ordered, [{ sku: 'BOOT-1', qty: 4 }], [{ sku: 'BOOT-1', qty: 5 }]),
    (error: unknown) => error instanceof PurchaseOrderQuantityError && error.code === 'damaged_exceeds_received',
  );
});

test('receipt produces only usable stock movement', () => {
  const result = buildReceivedLines(ordered, [{ sku: 'BOOT-1', qty: 8 }], [{ sku: 'BOOT-1', qty: 2 }]);
  assert.equal(result.receivedLines[0].received, 8);
  assert.equal(result.receivedLines[0].damaged, 2);
  assert.equal(result.stockAdjustments[0].qty, 6);
});

test('quality returns are bounded and produce a stock reversal delta', () => {
  const lines = [{ sku: 'BOOT-1', received: 8, damaged: 2, returned: 1 }];
  const result = applyQualityReturns(lines, [{ sku: 'BOOT-1', qty: 4 }]);
  assert.equal(result.receivedLines[0].returned, 4);
  assert.equal(result.stockAdjustments[0].qty, -3);
  assert.throws(
    () => applyQualityReturns(lines, [{ sku: 'BOOT-1', qty: 7 }]),
    (error: unknown) => error instanceof PurchaseOrderQuantityError && error.code === 'returned_exceeds_usable',
  );
});

test('unknown and duplicate input lines are rejected', () => {
  assert.throws(() => buildReceivedLines(ordered, [{ sku: 'OTHER', qty: 1 }], []), /not a line/);
  assert.throws(() => buildReceivedLines(ordered, [{ sku: 'BOOT-1', qty: 1 }, { sku: 'boot-1', qty: 2 }], []), /more than once/);
});
