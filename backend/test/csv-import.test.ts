import assert from 'node:assert/strict';
import test from 'node:test';
import { PRODUCT_IMPORT_TEMPLATE, validateProductImportCsv } from '../src/catalogue/csv-import';

test('validates a safe CSV dry run without enabling writes', () => {
  const result = validateProductImportCsv(`${PRODUCT_IMPORT_TEMPLATE}BOOT-9,Safety Boot,Footwear,R 700.00,R 1080.00,12,A,12,7,1.5\n`);
  assert.equal(result.status, 'validated');
  assert.equal(result.canImport, false);
  assert.equal(result.dryRun, true);
  assert.equal(result.rowCount, 1);
  assert.equal(result.preview[0].sku, 'BOOT-9');
});

test('reports duplicate SKU and invalid values with row and column context', () => {
  const csv = 'Stock Code,Description,Cost Excl,Sell Excl,On Hand\nA-1,Item,20,10,2\nA-1,Other,bad,12,-1\n';
  const result = validateProductImportCsv(csv);
  assert.equal(result.status, 'invalid');
  assert.ok(result.errors.some((issue) => issue.code === 'duplicate_sku' && issue.row === 3));
  assert.ok(result.errors.some((issue) => issue.code === 'invalid_money' && issue.column === 'Cost Excl'));
  assert.ok(result.errors.some((issue) => issue.code === 'invalid_quantity' && issue.column === 'On Hand'));
  assert.ok(result.warnings.some((issue) => issue.code === 'negative_margin'));
});

test('requires canonical import columns', () => {
  const result = validateProductImportCsv('sku,title\nA-1,Item\n');
  assert.equal(result.status, 'invalid');
  assert.equal(result.errors.filter((issue) => issue.code === 'missing_column').length, 4);
});
