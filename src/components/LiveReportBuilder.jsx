import React, { useState, useEffect } from 'react';
import { fetchReports, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { EmployeeAllocationReport } from './EmployeeAllocationReport';
import { downloadCsv, dateStamp } from '../utils/exportCsv';
import { matchQuery } from './TableToolbar';
import { triggerPrint } from '../utils/printDoc';
import { Search, FileBarChart, Download, Printer, Loader2, RefreshCw } from 'lucide-react';

const rand = (n) => `R ${Number(n || 0).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;

// Real tenant reports from live commerce data, with CSV + PDF export. Reachable
// by any role with reports.read / commerce.read (tenant admin AND merchant), so
// a merchant can report the mine's PPE stock position without tenant-admin rights.
const REPORT_DEFS = {
  allocations: {
    name: 'Stock allocation by employee',
    custom: true,
  },
  stock: {
    name: 'Stock valuation', pick: (r) => r.stockValuation?.rows ?? [],
    cols: [
      { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Product' },
      { key: 'category', label: 'Category' },
      { key: 'onHand', label: 'On hand', num: true },
      { key: 'inTransit', label: 'In transit', num: true },
      { key: 'unitPrice', label: 'Unit price (RP)', num: true, money: true },
      { key: 'stockRetail', label: 'Total value (@ RP)', num: true, money: true },
    ],
  },
  reorder: {
    name: 'Reorder (low cover)', pick: (r) => r.reorder?.rows ?? [],
    cols: [
      { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Product' }, { key: 'category', label: 'Category' },
      { key: 'onHand', label: 'On hand', num: true }, { key: 'inTransit', label: 'In transit', num: true },
      { key: 'dailyConsumption', label: 'Daily use', num: true }, { key: 'coverDays', label: 'Cover (days)', num: true, flag: (v) => v < 7 },
      { key: 'leadTimeDays', label: 'Lead (days)', num: true },
    ],
  },
  customers: {
    name: 'Department spend', pick: (r) => r.customerSpend?.rows ?? [],
    cols: [
      { key: 'company', label: 'Department / Section' }, { key: 'currency', label: 'Cur' },
      { key: 'limit', label: 'Budget limit', num: true, money: true }, { key: 'spent', label: 'Spent (@ RP)', num: true, money: true },
      { key: 'pctUsed', label: '% used', num: true, pct: true, flag: (v) => v >= 80 },
    ],
  },
  orders: {
    name: 'Orders & Issues', pick: (r) => r.orders?.rows ?? [],
    cols: [
      { key: 'order', label: 'Order ref' }, { key: 'email', label: 'Recipient' }, { key: 'currency', label: 'Cur' },
      { key: 'total', label: 'Total value (@ RP)', num: true, money: true }, { key: 'status', label: 'Status' }, { key: 'date', label: 'Date' },
    ],
  },
};

const fmtCell = (col, v) => {
  if (v == null) return col.restrict ? 'Restricted' : '—';
  if (col.money) return rand(v);
  if (col.pct) return `${Number(v).toFixed(0)}%`;
  if (col.num) return Number(v).toLocaleString('en-ZA');
  return v;
};

export const LiveReportBuilder = ({ scope, triggerNotification, sharedData, sharedLoading, sharedError, onRefresh }) => {
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;
  const usesSharedData = sharedData !== undefined;
  const [localData, setLocalData] = useState(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [active, setActive] = useState('allocations');
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  useEffect(() => { setSearch(''); }, [active]);

  useEffect(() => {
    if (usesSharedData) return;
    if (!live) { setLocalData(null); return; }
    setLocalData(null); setLocalLoading(true); setLocalError(null);
    fetchReports(scope).then((r) => setLocalData(r.reports ? r : { reports: r })).catch((e) => setLocalError(e)).finally(() => setLocalLoading(false));
  }, [usesSharedData, live, scope.accessToken, scope.tenantId, scope.siteId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = usesSharedData ? sharedData : localData;
  const loading = usesSharedData ? sharedLoading : localLoading;
  const error = usesSharedData ? sharedError : localError;
  const refresh = () => { if (usesSharedData) onRefresh?.(); else setReloadKey((key) => key + 1); };

  const def = REPORT_DEFS[active];
  const allRows = data?.reports && !def.custom ? def.pick(data.reports) : [];
  const rows = allRows.filter((r) => matchQuery(r, search, (def.cols || []).map((c) => c.key)));
  const totals = active === 'stock' ? data?.reports?.stockValuation?.totals : null;
  const generatedAt = data?.generatedAt ? new Date(data.generatedAt).toLocaleString('en-ZA') : null;

  const exportCsvNow = () => {
    if (def.custom) return;
    downloadCsv(`sightlive-${active}-report-${dateStamp()}`, def.cols.map((c) => ({
      key: c.key, label: c.label,
      map: (row) => { const v = row[c.key]; if (v == null) return c.restrict ? 'Restricted' : ''; return c.money || c.pct || c.num ? v : v; },
    })), rows);
    triggerNotification('Report exported', `${def.name} · ${rows.length} rows to CSV.`, 'success');
  };

  const printPdf = () => {
    if (def.custom) return;
    const w = window.open('', '_blank');
    if (!w) { triggerNotification('Popup blocked', 'Allow popups to export the PDF.', 'warning'); return; }
    const th = def.cols.map((c) => `<th style="text-align:${c.num ? 'right' : 'left'}">${c.label}</th>`).join('');
    const tb = rows.map((row) => `<tr>${def.cols.map((c) => `<td style="text-align:${c.num ? 'right' : 'left'}">${fmtCell(c, row[c.key])}</td>`).join('')}</tr>`).join('');
    w.document.write(`<html><head><title>${def.name} — SightLive</title><style>
      body{font-family:Inter,Arial,sans-serif;color:#111;padding:28px;font-size:12px}
      h1{font-size:19px;margin:0 0 2px} .sub{color:#666;font-size:11px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse} th,td{padding:6px 9px;border-bottom:1px solid #ddd}
      th{background:#f5f5f4;text-transform:uppercase;font-size:9.5px;letter-spacing:.05em}
      tfoot td{font-weight:700;border-top:2px solid #999}
    </style></head><body>
      <h1>${def.name}</h1><div class="sub">SightLive · generated ${generatedAt ?? dateStamp()} · ${rows.length} rows</div>
      <table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody>${totals ? `<tfoot><tr><td colspan="${def.cols.length - 1}">Total stock value (@ RP)</td><td style="text-align:right">${rand(totals.stockRetailValue)}</td></tr></tfoot>` : ''}</table>
    </body></html>`);
    w.document.close(); triggerPrint(w);
    triggerNotification('Print / PDF', `${def.name} opened — use “Save as PDF”.`, 'info');
  };

  return (
    <div className="card">
      <div className="card-hd">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileBarChart size={17} style={{ color: 'var(--primary)' }} /><h3>Reports &amp; Stock Allocations</h3>
          <span className={`badge ${live ? 'badge-success' : 'badge-neutral'}`}>{live ? 'Live data' : 'Demo mode'}</span>
        </div>
        {live && <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading} aria-label="Refresh">{loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}</button>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        <div style={{ width: 230, borderRight: '1px solid var(--border)', padding: 16, minWidth: 190 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Reports</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(REPORT_DEFS).map(([k, d]) => (
              <button key={k} onClick={() => setActive(k)} className={`btn btn-sm ${k === active ? 'btn-primary' : 'btn-secondary'}`} style={{ justifyContent: 'flex-start' }}>{d.name}</button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, padding: 18, minWidth: 320 }}>
          {def.custom ? (
            <EmployeeAllocationReport embedded={true} />
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ fontSize: 18 }}>{def.name}</h3>
                  {generatedAt && <div className="eyebrow">as at {generatedAt}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {live && <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Search size={14} style={{ position: 'absolute', left: 9, color: 'var(--text-subtle)', pointerEvents: 'none' }} />
                    <input className="input" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 30, width: 170, height: 34 }} aria-label="Search report" />
                  </div>}
                  <button className="btn btn-secondary btn-sm" onClick={exportCsvNow} disabled={!rows.length}><Download size={14} /> CSV</button>
                  <button className="btn btn-primary btn-sm" onClick={printPdf} disabled={!rows.length}><Printer size={14} /> Print / PDF</button>
                </div>
              </div>

              {!live && <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>Sign in to the live tenant to run reports from real stock, order and customer data.</p>}
              {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 14 }}>{error.message || 'Report could not be generated.'}</p>}
              {live && !error && (
                <div className="table-wrap card" style={{ boxShadow: 'none', marginTop: 14 }}>
                  <table className="table">
                    <thead><tr>{def.cols.map((c) => <th key={c.key} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr></thead>
                    <tbody>
                      {rows.length === 0 && <tr><td colSpan={def.cols.length} className="muted" style={{ textAlign: 'center', padding: 22 }}>{loading ? 'Generating…' : (search ? 'No rows match your search.' : 'No rows for this report yet.')}</td></tr>}
                      {rows.map((row, i) => (
                        <tr key={i}>
                          {def.cols.map((c) => {
                            const v = row[c.key];
                            const flagged = c.flag && v != null && c.flag(v);
                            return <td key={c.key} className={c.num ? 'num' : ''} style={flagged ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>{fmtCell(c, v)}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                    {totals && (
                      <tfoot>
                        <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border-strong)' }}>
                          <td colSpan={def.cols.length - 1}>Total stock valuation (@ RP)</td>
                          <td className="num" style={{ color: 'var(--primary)', textAlign: 'right' }}>{rand(totals.stockRetailValue)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
