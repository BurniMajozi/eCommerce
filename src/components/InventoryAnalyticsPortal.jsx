import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { fetchReports, fetchReportExport, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { downloadCsv, dateStamp } from '../utils/exportCsv';
import { MOCK_DEPARTMENT_CONSUMPTION, CAGELI_PRODUCTS } from '../data/mockData';
import { EmployeeAllocationReport } from './EmployeeAllocationReport';
import { AuditLogCard } from './AuditLogCard';
import {
  TrendingUp, AlertTriangle, FileDown, Boxes, Wallet, TriangleAlert, PackageX,
  Users, HardHat, Building2, Layers, Loader2, ShieldCheck
} from 'lucide-react';

export const InventoryAnalyticsPortal = () => {
  const { products, activePlant, auth, tenantAccess, triggerNotification } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;
  const canRunReports = (tenantAccess?.capabilities ?? []).includes('reports.run');

  // Export a server-authoritative stock report to send to the mine. reports.run
  // is MFA-gated, so if the session is aal1 we prompt the authenticator step-up
  // and retry the export once elevated.
  const [exporting, setExporting] = useState(false);
  const pendingExportRef = useRef(false);
  const runExport = async () => {
    if (!live) { triggerNotification('Not connected', 'Report export needs the live backend.', 'info'); return; }
    setExporting(true);
    try {
      const r = await fetchReportExport(scope);
      const cols = [
        { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Item' }, { key: 'category', label: 'Category' },
        { key: 'onHand', label: 'On hand' }, { key: 'inTransit', label: 'In transit' },
        { key: 'unitCost', label: 'Unit cost' }, { key: 'unitPrice', label: 'Unit price (RP)' },
        { key: 'stockCost', label: 'Stock cost value' }, { key: 'stockRetail', label: 'Stock value (RP)' },
        { key: 'coverDays', label: 'Cover (days)' },
      ];
      downloadCsv(`stock-report-${dateStamp()}`, cols, r.rows ?? []);
      triggerNotification('Report exported', `Stock report (${(r.rows ?? []).length} SKUs) downloaded — ready to send to the mine.`, 'success');
    } catch (e) {
      if (e?.code === 'mfa_required') {
        pendingExportRef.current = true;
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('sightlive:mfa-required'));
        triggerNotification('Verify to export', 'Confirm with your authenticator to run the report.', 'info');
      } else {
        triggerNotification('Export failed', e?.message || 'Could not generate the report.', 'danger');
      }
    } finally { setExporting(false); }
  };
  // Retry the export automatically once the session is elevated.
  useEffect(() => {
    const h = () => { if (pendingExportRef.current) { pendingExportRef.current = false; runExport(); } };
    window.addEventListener('sightlive:mfa-elevated', h);
    return () => window.removeEventListener('sightlive:mfa-elevated', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, scope.accessToken, scope.tenantId]);

  // Live tenant reports (stock valuation + reorder)
  const [reports, setReports] = useState(null);
  useEffect(() => {
    if (!live) { setReports(null); return; }
    let active = true;
    fetchReports(scope).then((r) => { if (active) setReports(r.reports ?? null); }).catch(() => { if (active) setReports(null); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, scope.accessToken, scope.tenantId, scope.siteId]);

  const getItemPrice = (p) => {
    if (p.sellingPrice != null && !isNaN(Number(p.sellingPrice)) && Number(p.sellingPrice) > 0) return Number(p.sellingPrice);
    const mock = CAGELI_PRODUCTS.find((cp) => cp.sku === p.sku);
    return mock?.sellingPrice || 0;
  };

  // Stock valuation to the mine is based on the Retail Price (the billed asset value).
  const stockValue = reports?.stockValuation?.totals?.stockRetailValue != null
    ? reports.stockValuation.totals.stockRetailValue
    : products.reduce((a, p) => a + getItemPrice(p) * (p.stockOnHand ?? 0), 0);

  const cover = (p) => Math.round(((p.stockOnHand || 0) + (p.stockInTransit || 0)) / (p.dailyConsumption || 1));
  const belowMin = reports?.reorder?.rows?.length != null
    ? reports.reorder.rows
    : products.filter((p) => cover(p) < 14);
  const critical = (reports?.reorder?.rows ?? products.filter((p) => cover(p) < 8)).length;
  const maxDept = Math.max(...MOCK_DEPARTMENT_CONSUMPTION.map((c) => c.vsEntitle));

  const FLAGS = [
    { t: 'Engineering & Maintenance: 168% entitlement consumption', open: true },
    { t: 'Store 2: 14 issues logged after shift end', open: true },
    { t: 'Heavy Nitrile Gloves: consumption 3× site average', open: true },
    { t: '1 approver signs 92% of early-replacement exceptions', open: true },
  ];

  const KPIS = [
    { icon: Wallet, label: 'Mine stock value (@ RP)', value: `R ${(stockValue / 1e6).toFixed(2)}m`, sub: live ? 'live plant inventory' : 'across all plant stores' },
    { icon: Building2, label: 'Monthly mine spend', value: 'R 223.6k', sub: 'across 6 departments', cls: 'up' },
    { icon: TriangleAlert, label: 'Quota flags', value: '2 departments', sub: 'exceeding 100% entitlement', accent: true },
    { icon: PackageX, label: 'Below min stock', value: `${belowMin.length} items`, sub: `${critical} critical cover` },
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 24 }}>
      <div className="page-head">
        <div>
          <h2>{activePlant.name} — PPE Control &amp; Allocation</h2>
          <p>Mine stock valuation, departmental consumption against entitlement, and employee issue registers.</p>
        </div>
        {canRunReports && (
          <button className="btn btn-primary" onClick={runExport} disabled={exporting} title="Run a live stock report (CSV) to send to the mine">
            {exporting ? <><Loader2 size={16} className="spin" /> Exporting…</> : <><FileDown size={16} /> Export stock report</>}
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="cols cols-4">
        {KPIS.map((k) => {
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

      {/* Department Consumption & Flags */}
      <div className="cols" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <div className="card">
          <div className="card-hd">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={17} style={{ color: 'var(--primary)' }} />
              <h3>Consumption per department vs entitlement</h3>
            </div>
            <span className="badge badge-neutral">this month</span>
          </div>
          <div className="card-bd">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 150, borderBottom: '1px solid var(--border)', paddingBottom: 2 }}>
              {MOCK_DEPARTMENT_CONSUMPTION.map((c) => (
                <div key={c.dept} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: c.flag ? 'var(--primary)' : 'var(--text-muted)', marginBottom: 4 }}>
                    {c.vsEntitle}%
                  </span>
                  <div style={{ width: '100%', maxWidth: 38, height: `${(c.vsEntitle / maxDept) * 100}%`, background: c.flag ? 'var(--primary)' : 'var(--surface-3)', borderRadius: '6px 6px 0 0' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              {MOCK_DEPARTMENT_CONSUMPTION.map((c) => (
                <span key={c.dept} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: c.flag ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.dept}>
                  {c.dept.split(' ')[0]}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 14, fontSize: 13, color: 'var(--primary)', fontWeight: 500 }}>
              <AlertTriangle size={15} /> Engineering &amp; Maintenance at 168% of entitlement — 3 months running.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-hd"><h3>Flags to review</h3><span className="badge badge-danger">{FLAGS.filter((f) => f.open).length} open</span></div>
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

      {/* Stock Allocation by Employee Report */}
      <EmployeeAllocationReport />

      {/* Stock ledger */}
      <div className="card">
        <div className="card-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Boxes size={17} style={{ color: 'var(--primary)' }} />
            <h3>Stock ledger — forward cover &amp; valuation</h3>
          </div>
          <span className={`badge ${live ? 'badge-success' : 'badge-neutral'}`}>{live ? `${products.length} live SKUs` : `${products.length} SKUs`}</span>
        </div>
        {live && products.length === 0 && (
          <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>Connecting to the live catalogue… stock will appear here once the tenant link resolves.</div>
        )}
        {products.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Item description</th>
                  <th>Department / Category</th>
                  <th className="num">Unit price (RP)</th>
                  <th className="num">On hand</th>
                  <th className="num">Transit</th>
                  <th className="num">Total value (RP)</th>
                  <th className="num">Cover</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const cv = cover(p);
                  const low = cv < 14;
                  const price = getItemPrice(p);
                  const lineTotal = price * (p.stockOnHand || 0);
                  return (
                    <tr key={p.sku} className={low ? 'row-flag' : ''}>
                      <td className="muted" style={{ fontWeight: 500 }}>{p.sku}</td>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td className="muted">{p.category || 'General PPE'}</td>
                      <td className="num tabular">R {price.toFixed(2)}</td>
                      <td className="num tabular">{p.stockOnHand ?? 0}</td>
                      <td className="num tabular muted">+{p.stockInTransit ?? 0}</td>
                      <td className="num tabular" style={{ fontWeight: 600 }}>R {lineTotal.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="num tabular" style={{ color: low ? 'var(--danger)' : 'var(--text)', fontWeight: low ? 600 : 400 }}>{cv}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tenant audit trail — for roles with audit.read (e.g. merchant reporting
          PPE stock activity to the mine). MFA-gated with an authenticator step-up. */}
      {(tenantAccess?.capabilities ?? []).includes('audit.read') && <AuditLogCard />}
    </div>
  );
};
