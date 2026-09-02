import React, { useMemo } from 'react';
import { Gauge, Clock, PackageCheck, AlertTriangle, RotateCcw, TrendingUp } from 'lucide-react';

const rand = (n) => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const pct = (n) => `${Math.round(n)}%`;
const parseLines = (rl) => {
  if (Array.isArray(rl)) return rl;
  if (typeof rl === 'string') { try { return JSON.parse(rl); } catch { return []; } }
  return [];
};
const daysBetween = (a, b) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

// Supplier performance scorecard, computed from received PO movements: on-time
// delivery, fill accuracy (short/over), damage-in-transit, quality returns and
// price variance (PO cost vs the product's cost). One row per supplier + a grade.
export const SupplierPerformanceMatrix = ({ purchaseOrders = [], products = [] }) => {
  const costBySku = useMemo(() => {
    const m = new Map();
    for (const p of products) if (p.sku && p.costPrice != null) m.set(String(p.sku).toLowerCase(), Number(p.costPrice));
    return m;
  }, [products]);

  const suppliers = useMemo(() => {
    const acc = new Map();
    for (const po of purchaseOrders) {
      if (po.status !== 'received') continue;
      const name = po.supplier || 'Unknown supplier';
      if (!acc.has(name)) acc.set(name, { name, deliveries: 0, onTime: 0, lateDays: 0, lateCount: 0, ordered: 0, received: 0, short: 0, over: 0, damaged: 0, returned: 0, varianceAmt: 0, costBaseline: 0 });
      const s = acc.get(name);
      s.deliveries += 1;
      if (po.receivedAt && po.expectedDate) {
        const d = daysBetween(String(po.receivedAt).slice(0, 10), String(po.expectedDate).slice(0, 10));
        if (d <= 0) s.onTime += 1; else { s.lateCount += 1; s.lateDays += d; }
      } else s.onTime += 1; // no expected date on file → treat as on-time
      const lines = parseLines(po.receivedLines);
      const src = lines.length ? lines : (po.lines ?? []).map((l) => ({ sku: l.sku, ordered: Math.floor(Number(l.qty || 0)), received: Math.floor(Number(l.qty || 0)), damaged: 0, returned: 0, unitCost: Number(l.unit_cost || 0) }));
      for (const l of src) {
        const ordered = Number(l.ordered ?? l.qty ?? 0);
        const received = Number(l.received ?? ordered);
        s.ordered += ordered; s.received += received;
        if (received < ordered) s.short += 1; else if (received > ordered) s.over += 1;
        s.damaged += Number(l.damaged || 0);
        s.returned += Number(l.returned || 0);
        const unitCost = Number(l.unitCost ?? l.unit_cost ?? 0);
        const baseline = costBySku.get(String(l.sku || '').toLowerCase());
        if (baseline != null && unitCost > 0) { s.varianceAmt += (unitCost - baseline) * received; s.costBaseline += baseline * received; }
      }
    }
    return [...acc.values()].map((s) => {
      const onTimePct = s.deliveries ? (s.onTime / s.deliveries) * 100 : 100;
      const fillPct = s.ordered ? Math.min(100, (s.received / s.ordered) * 100) : 100;
      const qualityIssues = s.damaged + s.returned;
      const qualityPct = s.received ? Math.max(0, 100 - (qualityIssues / s.received) * 100) : 100;
      const variancePct = s.costBaseline ? (s.varianceAmt / s.costBaseline) * 100 : 0;
      const score = onTimePct * 0.4 + fillPct * 0.3 + qualityPct * 0.3;
      const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 68 ? 'C' : score >= 55 ? 'D' : 'E';
      return { ...s, onTimePct, fillPct, qualityPct, variancePct, avgDaysLate: s.lateCount ? s.lateDays / s.lateCount : 0, score, grade };
    }).sort((a, b) => b.score - a.score);
  }, [purchaseOrders, costBySku]);

  const gradeColor = (g) => (g === 'A' ? 'badge-success' : g === 'B' ? 'badge-success' : g === 'C' ? 'badge-warning' : 'badge-danger');
  const totals = suppliers.reduce((a, s) => ({ deliveries: a.deliveries + s.deliveries, damaged: a.damaged + s.damaged, returned: a.returned + s.returned }), { deliveries: 0, damaged: 0, returned: 0 });

  return (
    <div className="card">
      <div className="card-hd">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Gauge size={17} style={{ color: 'var(--primary)' }} /><h3>Supplier performance</h3><span className="badge badge-neutral">{suppliers.length} suppliers · {totals.deliveries} deliveries</span></div>
      </div>
      {suppliers.length === 0 ? (
        <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>No received purchase orders yet — the scorecard builds from PO movements (receive stock, log damage, report quality returns).</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr>
              <th>Supplier</th>
              <th className="center" title="Deliveries received">Del.</th>
              <th className="center"><Clock size={12} style={{ verticalAlign: -1 }} /> On-time</th>
              <th className="center"><PackageCheck size={12} style={{ verticalAlign: -1 }} /> Fill</th>
              <th className="center" title="Short / over delivery lines">Short/Over</th>
              <th className="center"><AlertTriangle size={12} style={{ verticalAlign: -1 }} /> Damaged</th>
              <th className="center"><RotateCcw size={12} style={{ verticalAlign: -1 }} /> Returns</th>
              <th className="num"><TrendingUp size={12} style={{ verticalAlign: -1 }} /> Price var.</th>
              <th className="center">Grade</th>
            </tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.name}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td className="center">{s.deliveries}</td>
                  <td className="center"><span className={`badge ${s.onTimePct >= 90 ? 'badge-success' : s.onTimePct >= 75 ? 'badge-warning' : 'badge-danger'}`}>{pct(s.onTimePct)}</span>{s.avgDaysLate > 0 && <div className="eyebrow">avg {s.avgDaysLate.toFixed(1)}d late</div>}</td>
                  <td className="center">{pct(s.fillPct)}</td>
                  <td className="center">{s.short > 0 && <span className="badge badge-warning" style={{ marginRight: 4 }}>{s.short} short</span>}{s.over > 0 && <span className="badge badge-neutral">{s.over} over</span>}{s.short === 0 && s.over === 0 && <span className="muted">—</span>}</td>
                  <td className="center">{s.damaged > 0 ? <span className="badge badge-danger">{s.damaged}</span> : <span className="muted">0</span>}</td>
                  <td className="center">{s.returned > 0 ? <span className="badge badge-danger">{s.returned}</span> : <span className="muted">0</span>}</td>
                  <td className="num tabular" style={{ color: s.varianceAmt > 0 ? 'var(--danger)' : s.varianceAmt < 0 ? 'var(--success)' : 'var(--text-muted)' }}>{s.varianceAmt ? `${s.varianceAmt > 0 ? '+' : ''}${rand(s.varianceAmt)}` : '—'}{s.costBaseline > 0 && s.varianceAmt !== 0 && <div className="eyebrow">{s.variancePct > 0 ? '+' : ''}{s.variancePct.toFixed(1)}%</div>}</td>
                  <td className="center"><span className={`badge ${gradeColor(s.grade)}`} style={{ fontWeight: 700, minWidth: 22 }}>{s.grade}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 11.5, padding: '10px 14px', margin: 0 }}>Computed from received POs. On-time = received-by vs expected date · Fill = received ÷ ordered · Damaged = logged at receipt · Returns = quality rejects · Price variance = PO unit cost vs the product's cost. Grade weights on-time 40% · fill 30% · quality 30%.</p>
        </div>
      )}
    </div>
  );
};
