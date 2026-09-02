import React, { useMemo } from 'react';
import { Gauge, Clock, PackageCheck, AlertTriangle, RotateCcw, TrendingUp } from 'lucide-react';
import { calculateSupplierPerformance } from '../utils/supplierPerformance';

const rand = (n) => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const pct = (n) => `${Math.round(n)}%`;
// Supplier performance scorecard, computed from received PO movements: on-time
// delivery, fill accuracy (short/over), damage-in-transit, quality returns and
// price variance (PO cost vs protected cost data). One row per supplier + grade.
export const SupplierPerformanceMatrix = ({ purchaseOrders = [], profitabilityItems = [] }) => {
  const suppliers = useMemo(
    () => calculateSupplierPerformance(purchaseOrders, profitabilityItems),
    [purchaseOrders, profitabilityItems],
  );

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
                  <td className="center">{s.onTimePct == null
                    ? <span className="badge badge-neutral" title="No expected date was recorded">Unknown</span>
                    : <span className={`badge ${s.onTimePct >= 90 ? 'badge-success' : s.onTimePct >= 75 ? 'badge-warning' : 'badge-danger'}`}>{pct(s.onTimePct)}</span>}{s.avgDaysLate > 0 && <div className="eyebrow">avg {s.avgDaysLate.toFixed(1)}d late</div>}</td>
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
