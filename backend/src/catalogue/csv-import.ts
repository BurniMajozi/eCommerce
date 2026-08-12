export const PRODUCT_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMPORT_MAX_ROWS = 5_000;

export const PRODUCT_IMPORT_COLUMNS = [
  'Stock Code',
  'Description',
  'Category',
  'Cost Excl',
  'Sell Excl',
  'On Hand',
  'ABC Class',
  'Lifespan Months',
  'Lead Time Days',
  'Daily Consumption',
] as const;

export const PRODUCT_IMPORT_TEMPLATE = `${PRODUCT_IMPORT_COLUMNS.join(',')}\n`;

type CsvIssue = { row: number; column: string | null; code: string; message: string };

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field.trim());
      field = '';
    } else if (character === '\n') {
      row.push(field.trim());
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      field = '';
    } else if (character !== '\r') {
      field += character;
    }
  }
  if (quoted) throw new Error('unterminated_quote');
  row.push(field.trim());
  if (row.some((value) => value.length)) rows.push(row);
  return rows;
}

function money(value: string): number | null {
  const normalized = value.replace(/\s/g, '').replace(/^R/i, '').replace(/,/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function number(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateProductImportCsv(csv: string) {
  const errors: CsvIssue[] = [];
  const warnings: CsvIssue[] = [];
  const byteLength = Buffer.byteLength(csv, 'utf8');
  if (byteLength > PRODUCT_IMPORT_MAX_BYTES) {
    errors.push({ row: 0, column: null, code: 'file_too_large', message: 'CSV exceeds the 5 MB validation limit.' });
    return { status: 'invalid' as const, dryRun: true, canImport: false, rowCount: 0, validRowCount: 0, errors, warnings, preview: [] };
  }

  let rows: string[][];
  try {
    rows = parseCsvRows(csv.replace(/^\uFEFF/, ''));
  } catch {
    errors.push({ row: 0, column: null, code: 'invalid_csv', message: 'CSV contains an unterminated quoted field.' });
    return { status: 'invalid' as const, dryRun: true, canImport: false, rowCount: 0, validRowCount: 0, errors, warnings, preview: [] };
  }
  if (!rows.length) {
    errors.push({ row: 0, column: null, code: 'empty_file', message: 'CSV has no header row.' });
    return { status: 'invalid' as const, dryRun: true, canImport: false, rowCount: 0, validRowCount: 0, errors, warnings, preview: [] };
  }

  const headers = rows[0].map((value) => value.trim());
  const required = ['Stock Code', 'Description', 'Cost Excl', 'Sell Excl'];
  for (const column of required) {
    if (!headers.includes(column)) errors.push({ row: 1, column, code: 'missing_column', message: `Required column ${column} is missing.` });
  }
  const unknown = headers.filter((header) => !PRODUCT_IMPORT_COLUMNS.includes(header as typeof PRODUCT_IMPORT_COLUMNS[number]));
  for (const column of unknown) warnings.push({ row: 1, column, code: 'unknown_column', message: `Column ${column} will be ignored by the future import workflow.` });

  const dataRows = rows.slice(1);
  if (dataRows.length > PRODUCT_IMPORT_MAX_ROWS) {
    errors.push({ row: 0, column: null, code: 'too_many_rows', message: `CSV exceeds the ${PRODUCT_IMPORT_MAX_ROWS} row validation limit.` });
  }
  const index = Object.fromEntries(headers.map((header, position) => [header, position]));
  const seenSkus = new Set<string>();
  const preview: Array<Record<string, unknown>> = [];
  let validRowCount = 0;

  for (const [offset, values] of dataRows.slice(0, PRODUCT_IMPORT_MAX_ROWS).entries()) {
    const rowNumber = offset + 2;
    const rowErrorsBefore = errors.length;
    const value = (column: string) => values[index[column]]?.trim() ?? '';
    const sku = value('Stock Code');
    const title = value('Description');
    const costPrice = money(value('Cost Excl'));
    const sellingPrice = money(value('Sell Excl'));
    const stockOnHand = number(value('On Hand'));

    if (!sku) errors.push({ row: rowNumber, column: 'Stock Code', code: 'required', message: 'Stock Code is required.' });
    else if (seenSkus.has(sku.toUpperCase())) errors.push({ row: rowNumber, column: 'Stock Code', code: 'duplicate_sku', message: `Duplicate SKU ${sku}.` });
    else seenSkus.add(sku.toUpperCase());
    if (!title) errors.push({ row: rowNumber, column: 'Description', code: 'required', message: 'Description is required.' });
    if (costPrice === null || costPrice < 0) errors.push({ row: rowNumber, column: 'Cost Excl', code: 'invalid_money', message: 'Cost Excl must be a non-negative number.' });
    if (sellingPrice === null || sellingPrice < 0) errors.push({ row: rowNumber, column: 'Sell Excl', code: 'invalid_money', message: 'Sell Excl must be a non-negative number.' });
    if (stockOnHand !== null && (!Number.isInteger(stockOnHand) || stockOnHand < 0)) {
      errors.push({ row: rowNumber, column: 'On Hand', code: 'invalid_quantity', message: 'On Hand must be a non-negative whole number.' });
    }
    if (costPrice !== null && sellingPrice !== null && sellingPrice < costPrice) {
      warnings.push({ row: rowNumber, column: 'Sell Excl', code: 'negative_margin', message: 'Selling price is below cost.' });
    }

    if (errors.length === rowErrorsBefore) validRowCount += 1;
    if (preview.length < 10) preview.push({ sku, title, category: value('Category') || null, costPrice, sellingPrice, stockOnHand });
  }

  return {
    status: errors.length ? 'invalid' as const : 'validated' as const,
    dryRun: true,
    canImport: false,
    message: 'Validation only. No Medusa products, prices or inventory were written.',
    rowCount: dataRows.length,
    validRowCount,
    errors,
    warnings,
    preview,
  };
}
