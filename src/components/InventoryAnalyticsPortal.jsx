import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { fetchReports, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { MOCK_CREW_CONSUMPTION } from '../data/mockData';
import { TrendingUp, AlertTriangle, FileDown, Boxes, Wallet, TriangleAlert, PackageX } from 'lucide-react';

export const InventoryAnalyticsPortal = () => {
  const { products, activePlant, auth, tenantAccess, triggerNotification } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;

  // Live tenant reports (stock valuation + reorder) — drives the dashboard KPIs
  // and the below-min count. Falls back to product-derived values when offline.
  const [reports, setReports] = useState(null);
  useEffect(() => {
    if (!live) { setReports(null); return; }
    let active = true;
    fetchReports(scope).then((r) => { if (active) setReports(r.reports ?? null); }).catch(() => { if (active) setReports(null); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, scope.accessToken, scope.tenantId, scope.siteId]);

  const stockValue = reports?.stockValuation?.totals?.stockCostValue != null
    ? reports.stockValuation.totals.stockCostValue
    : products.reduce((a, p) => a + (p.costPrice ?? 0) * (p.stockOnHand ?? 0), 0);
  const potentialProfit = reports?.stockValuation?.totals?.potentialProfit ?? null;
  const cover = (p) => Math.round((p.stockOnHand + p.stockInTransit) / (p.dailyConsumption || 1));
  const belowMin = reports?.reorder?.rows?.length != null
    ? reports.reorder.rows
    : products.filter(p => cover(p) < 14);
  const critical = (reports?.reorder?.rows ?? products.filter(p => cover(p) < 8)).length;
  const maxCrew = Math.max(...MOCK_CREW_CONSUMPTION.map(c => c.vsEntitle));

  const FLAGS = [
    { t: '4 workers claimed "lost" ≥3× this quarter', open: true },
    { t: 'Store 2: 14 issues logged after shift end', open: true },
    { t: 'Glove L consumption 3× site average', open: true },
    { t: '1 approver signs 92% of exceptions', open: true },
  ];

  const KPIS = [
    { icon: Wallet, label: 'Stock value', value: `R ${(stockValue / 1e6).toFixed(2)}m`, sub: live ? 'live tenant stock' : 'across 3 stores' },
    { icon: TrendingUp, label: 'Potential profit', value: potentialProfit != null ? `R ${(potentialProfit / 1e3).toFixed(0)}k` : '—', sub: 'at retail − cost', cls: 'up' },
    { icon: TriangleAlert, label: 'Unexplained variance', value: 'R 9 400', sub: 'count vs ledger', accent: true },
    { icon: PackageX, label: 'Below min', value: `${belowMin.length} items`, sub: `${critical} critical` },
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 24 }}>
      <div className="page-head">
        <div>
          <h2>{activePlant.name} — PPE control</h2>
          <p>Stock value, consumption against entitlement, and the abuse signals worth a manager's attention.</p>
        </div>
        <button className="btn btn-primary" onClick={() => triggerNotification('Report generated', 'Abuse-signal report → PDF · XLS · sent to Finance.', 'success')}>
          <FileDown size={16} /> Generate report
        </button>
      </div>

      {/* KPIs */}
      <div className="cols cols-4">
        {KPIS.map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="card" style={{ borderColor: k.accent ? 'var(--primary-weak-bd)' : 'var(--border)' }}>
              <div className="card-bd" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className="kpi-label">{k.label}</span>
                  <Icon size={18} style={{ color: k.accent ? 'var(--primary)' : 'var(--text-subtle)' }} />
                </div>
                <div className="kpi-value" style={{ color: k.accent ? 'var(--primary)' : 'var(--text)' }}>{k.value}</div>
                <div className={`kpi-sub ${k.cls || ''}`}>{k.sub}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Consumption + flags */}
      <div className="cols" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <div className="card">
          <div className="card-hd"><h3>Consumption per crew vs entitlement</h3><span className="badge badge-neutral">this month</span></div>
          <div className="card-bd">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 150, borderBottom: '1px solid var(--border)', paddingBottom: 2 }}>
              {MOCK_CREW_CONSUMPTION.map(c => (
                <div key={c.crew} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: c.flag ? 'var(--primary)' : 'var(--text-muted)', marginBottom: 4 }}>{c.vsEntitle}%</span>
                  <div style={{ width: '100%', maxWidth: 42, height: `${(c.vsEntitle / maxCrew) * 100}%`, background: c.flag ? 'var(--primary)' : 'var(--surface-3)', borderRadius: '6px 6px 0 0' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
              {MOCK_CREW_CONSUMPTION.map(c => (
                <span key={c.crew} style={{ flex: 1, textAlign: 'center', fontSize: 12, color: c.flag ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 500 }}>{c.crew.split(' ')[1]}</span>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, fontSize: 13, color: 'var(--primary)' }}>
              <AlertTriangle size={15} /> Crew C at 168% of entitlement — 3 months running.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-hd"><h3>Flags to review</h3><span className="badge badge-danger">{FLAGS.filter(f => f.open).length} open</span></div>
          <div className="card-bd" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {FLAGS.map((f, i) => (
              <div key={i} className="card" style={{ boxShadow: 'none', background: f.open ? 'var(--danger-weak)' : 'var(--surface-2)', borderColor: f.open ? 'var(--primary-weak-bd)' : 'var(--border)' }}>
                <div className="card-bd" style={{ padding: '11px 13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13 }}>{f.t}</span>
                  {f.open && <span className="badge badge-danger" style={{ fontSize: 10 }}>open</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stock ledger */}
      <div className="card">
        <div className="card-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Boxes size={17} style={{ color: 'var(--primary)' }} /><h3>Stock ledger — forward cover &amp; value</h3></div>
          <span className={`badge ${live ? 'badge-success' : 'badge-neutral'}`}>{live ? `${products.length} live SKUs` : `${products.length} SKUs`}</span>
        </div>
        {live && products.length === 0 && (
          <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>Connecting to the live catalogue… stock will appear here once the tenant link resolves.</div>
        )}
        {products.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>SKU</th><th>Item</th><th className="center">Cat</th><th className="num">Cost</th><th className="num">On hand</th><th className="num">Transit</th><th className="num">Cover</th></tr>
            </thead>
            <tbody>
              {products.map(p => {
                const cv = cover(p); const low = cv < 14;
                return (
                  <tr key={p.sku} className={low ? 'row-flag' : ''}>
                    <td className="muted">{p.sku}</td>
                    <td style={{ fontWeight: 500 }}>{p.name}</td>
                    <td className="center"><span className="badge badge-neutral" style={{ fontSize: 10 }}>{p.abcClass}</span></td>
                    <td className="num">{p.costPrice != null ? `R ${p.costPrice.toFixed(2)}` : '—'}</td>
                    <td className="num">{p.stockOnHand ?? 0}</td>
                    <td className="num muted">+{p.stockInTransit ?? 0}</td>
                    <td className="num" style={{ color: low ? 'var(--danger)' : 'var(--text)', fontWeight: low ? 600 : 400 }}>{cv}d</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  );
};
