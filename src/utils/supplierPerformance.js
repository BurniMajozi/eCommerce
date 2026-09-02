const parseLines = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return []; }
  }
  return [];
};

const daysBetween = (actual, expected) => Math.round(
  (new Date(actual).getTime() - new Date(expected).getTime()) / 86400000,
);

// Cost baselines must come from the protected profitability endpoint, never
// from the ordinary catalogue used by workers and buyers.
export function calculateSupplierPerformance(purchaseOrders = [], profitabilityItems = []) {
  const costBySku = new Map();
  for (const item of profitabilityItems) {
    if (item?.sku && Number.isFinite(Number(item.averageCost))) {
      costBySku.set(String(item.sku).toLowerCase(), Number(item.averageCost));
    }
  }

  const acc = new Map();
  for (const po of purchaseOrders) {
    if (po.status !== 'received') continue;
    const name = po.supplier || 'Unknown supplier';
    if (!acc.has(name)) {
      acc.set(name, {
        name, deliveries: 0, scheduledDeliveries: 0, onTime: 0,
        lateDays: 0, lateCount: 0, ordered: 0, received: 0,
        short: 0, over: 0, damaged: 0, returned: 0,
        varianceAmt: 0, costBaseline: 0,
      });
    }
    const supplier = acc.get(name);
    supplier.deliveries += 1;
    if (po.receivedAt && po.expectedDate) {
      supplier.scheduledDeliveries += 1;
      const days = daysBetween(String(po.receivedAt).slice(0, 10), String(po.expectedDate).slice(0, 10));
      if (days <= 0) supplier.onTime += 1;
      else { supplier.lateCount += 1; supplier.lateDays += days; }
    }

    const recorded = parseLines(po.receivedLines);
    const lines = recorded.length
      ? recorded
      : (po.lines ?? []).map((line) => ({
          sku: line.sku, ordered: Math.floor(Number(line.qty || 0)),
          received: Math.floor(Number(line.qty || 0)), damaged: 0,
          returned: 0, unitCost: Number(line.unit_cost || 0),
        }));
    for (const line of lines) {
      const ordered = Number(line.ordered ?? line.qty ?? 0);
      const received = Number(line.received ?? ordered);
      supplier.ordered += ordered;
      supplier.received += received;
      if (received < ordered) supplier.short += 1;
      else if (received > ordered) supplier.over += 1;
      supplier.damaged += Number(line.damaged || 0);
      supplier.returned += Number(line.returned || 0);
      const unitCost = Number(line.unitCost ?? line.unit_cost ?? 0);
      const baseline = costBySku.get(String(line.sku || '').toLowerCase());
      if (baseline != null && unitCost > 0) {
        supplier.varianceAmt += (unitCost - baseline) * received;
        supplier.costBaseline += baseline * received;
      }
    }
  }

  return [...acc.values()].map((supplier) => {
    const onTimePct = supplier.scheduledDeliveries
      ? (supplier.onTime / supplier.scheduledDeliveries) * 100
      : null;
    const fillPct = supplier.ordered ? Math.min(100, (supplier.received / supplier.ordered) * 100) : 100;
    const qualityIssues = supplier.damaged + supplier.returned;
    const qualityPct = supplier.received ? Math.max(0, 100 - (qualityIssues / supplier.received) * 100) : 100;
    const variancePct = supplier.costBaseline ? (supplier.varianceAmt / supplier.costBaseline) * 100 : 0;
    // Missing schedule data earns no free on-time points. Reweight the two
    // measurable dimensions until a delivery has an expected date.
    const score = onTimePct == null
      ? fillPct * 0.5 + qualityPct * 0.5
      : onTimePct * 0.4 + fillPct * 0.3 + qualityPct * 0.3;
    const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 68 ? 'C' : score >= 55 ? 'D' : 'E';
    return {
      ...supplier, onTimePct, fillPct, qualityPct, variancePct,
      avgDaysLate: supplier.lateCount ? supplier.lateDays / supplier.lateCount : 0,
      score, grade,
    };
  }).sort((a, b) => b.score - a.score);
}
