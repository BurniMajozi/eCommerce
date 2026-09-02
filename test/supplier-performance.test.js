import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSupplierPerformance } from '../src/utils/supplierPerformance.js';

test('missing expected dates are unknown rather than automatically on-time', () => {
  const [supplier] = calculateSupplierPerformance([{
    status: 'received', supplier: 'Safe Supply', receivedAt: '2026-09-01',
    expectedDate: null,
    receivedLines: [{ sku: 'BOOT', ordered: 5, received: 5, damaged: 0, returned: 0, unitCost: 100 }],
  }], [{ sku: 'BOOT', averageCost: 90 }]);
  assert.equal(supplier.onTimePct, null);
  assert.equal(supplier.scheduledDeliveries, 0);
  assert.equal(supplier.score, 100);
});

test('price variance uses protected profitability data', () => {
  const [supplier] = calculateSupplierPerformance([{
    status: 'received', supplier: 'Safe Supply', receivedAt: '2026-09-01',
    expectedDate: '2026-09-01',
    receivedLines: [{ sku: 'BOOT', ordered: 2, received: 2, unitCost: 110 }],
  }], [{ sku: 'BOOT', averageCost: 100 }]);
  assert.equal(supplier.varianceAmt, 20);
  assert.equal(supplier.costBaseline, 200);
});
