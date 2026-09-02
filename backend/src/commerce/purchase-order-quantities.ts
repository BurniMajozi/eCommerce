export class PurchaseOrderQuantityError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

type Line = Record<string, any>;

const keyOf = (line: Line): string => String(line.sku ?? line.product_id ?? '').trim().toLowerCase();

const quantity = (value: unknown, label: string): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    throw new PurchaseOrderQuantityError('invalid_quantity', `${label} must be a non-negative whole number.`);
  }
  return parsed;
};

function inputMap(lines: unknown, label: string): Map<string, number> {
  const result = new Map<string, number>();
  if (lines == null) return result;
  if (!Array.isArray(lines)) throw new PurchaseOrderQuantityError('invalid_quantity_lines', `${label} must be an array.`);
  for (const line of lines as Line[]) {
    const key = keyOf(line);
    if (!key) throw new PurchaseOrderQuantityError('line_identifier_required', `Every ${label} entry needs a SKU or product id.`);
    if (result.has(key)) throw new PurchaseOrderQuantityError('duplicate_quantity_line', `${key} appears more than once in ${label}.`);
    result.set(key, quantity(line.qty ?? line.received ?? line.damaged ?? 0, `${label} quantity for ${key}`));
  }
  return result;
}

function assertKnownKeys(input: Map<string, number>, known: Set<string>, label: string): void {
  for (const key of input.keys()) {
    if (!known.has(key)) throw new PurchaseOrderQuantityError('unknown_quantity_line', `${key} is not a line on this purchase order (${label}).`);
  }
}

export function buildReceivedLines(orderedLines: Line[], receivedInput: unknown, damagedInput: unknown) {
  const received = inputMap(receivedInput, 'receivedLines');
  const damaged = inputMap(damagedInput, 'damagedLines');
  const known = new Set(orderedLines.map(keyOf).filter(Boolean));
  assertKnownKeys(received, known, 'receivedLines');
  assertKnownKeys(damaged, known, 'damagedLines');

  const receivedLines = orderedLines.map((line) => {
    const key = keyOf(line);
    if (!key) throw new PurchaseOrderQuantityError('line_identifier_required', 'Every purchase-order line needs a SKU or product id.');
    const ordered = quantity(line.qty ?? 0, `ordered quantity for ${key}`);
    const receivedQty = received.has(key) ? received.get(key)! : ordered;
    const damagedQty = damaged.get(key) ?? 0;
    if (damagedQty > receivedQty) {
      throw new PurchaseOrderQuantityError('damaged_exceeds_received', `Damaged quantity for ${key} cannot exceed received quantity.`);
    }
    return {
      ...line, ordered, received: receivedQty, damaged: damagedQty,
      returned: 0, unitCost: Number(line.unit_cost ?? line.unitCost ?? 0),
    };
  });
  const stockAdjustments = receivedLines
    .map((line) => ({ ...line, qty: line.received - line.damaged }))
    .filter((line) => line.qty !== 0);
  return { receivedLines, stockAdjustments };
}

export function applyQualityReturns(existingLines: Line[], returnedInput: unknown) {
  const returned = inputMap(returnedInput, 'returnedLines');
  const known = new Set(existingLines.map(keyOf).filter(Boolean));
  assertKnownKeys(returned, known, 'returnedLines');

  const stockAdjustments: Line[] = [];
  const receivedLines = existingLines.map((line) => {
    const key = keyOf(line);
    if (!key) throw new PurchaseOrderQuantityError('line_identifier_required', 'Every received line needs a SKU or product id.');
    const receivedQty = quantity(line.received ?? line.qty ?? 0, `received quantity for ${key}`);
    const damagedQty = quantity(line.damaged ?? 0, `damaged quantity for ${key}`);
    const previousReturned = quantity(line.returned ?? 0, `existing returned quantity for ${key}`);
    const maxReturnable = Math.max(0, receivedQty - damagedQty);
    if (previousReturned > maxReturnable) {
      throw new PurchaseOrderQuantityError('existing_quality_data_invalid', `Existing returns for ${key} exceed usable received stock.`);
    }
    const nextReturned = returned.has(key) ? returned.get(key)! : previousReturned;
    if (nextReturned > maxReturnable) {
      throw new PurchaseOrderQuantityError('returned_exceeds_usable', `Returned quantity for ${key} cannot exceed received usable quantity (${maxReturnable}).`);
    }
    const stockDelta = previousReturned - nextReturned;
    if (stockDelta !== 0) stockAdjustments.push({ ...line, qty: stockDelta });
    return { ...line, received: receivedQty, damaged: damagedQty, returned: nextReturned };
  });
  return { receivedLines, stockAdjustments };
}
