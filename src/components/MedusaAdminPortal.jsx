import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { downloadProductImportTemplate, validateProductImport, deleteProduct, fetchOrders, fetchCommerceConfig, fetchEngine, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { ProductThumb } from './ProductThumb';
import { ProductFormModal } from './ProductFormModal';
import { ConfirmDialog } from './ConfirmDialog';
import {
  MEDUSA_ORDERS, MEDUSA_PROMOTIONS, MEDUSA_TAX_REGIONS, MEDUSA_CUSTOMERS,
  MEDUSA_WORKFLOWS, MEDUSA_EVENTS, MEDUSA_FULFILMENT, MEDUSA_CURRENCIES,
  buildVariants, getVariantOptions
} from '../data/mockData';
import {
  Tag, Boxes, ShoppingCart, BadgePercent, Percent, Truck, Upload, Wallet,
  Workflow, Radio, Plus, FileSpreadsheet, CheckCircle2, RotateCw, Globe2,
  ChevronRight, ChevronDown, Zap, GitBranch, Play, Pencil, Trash2
} from 'lucide-react';

const cur = (code) => MEDUSA_CURRENCIES.find(c => c.code === code) || MEDUSA_CURRENCIES[0];
const money = (amount, code) => `${cur(code).symbol} ${amount.toLocaleString('en-ZA')}`;

const Head = ({ icon: Icon, title, sub, action }) => (
  <div className="page-head">
    <div>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Icon size={22} style={{ color: 'var(--primary)' }} /> {title}</h2>
      <p>{sub}</p>
    </div>
    {action}
  </div>
);

const Wrap = ({ children }) => (
  <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 24 }}>{children}</div>
);

/* ---- n8n-style workflow node ---- */
const NODE_STYLE = {
  trigger: { tag: 'TRIGGER', bg: 'var(--success-weak)', bd: 'var(--success)', fg: 'var(--success)', Icon: Zap },
  action: { tag: 'ACTION', bg: 'var(--surface-2)', bd: 'var(--border-strong)', fg: 'var(--text)', Icon: Play },
  decision: { tag: 'IF', bg: 'var(--warning-weak)', bd: 'var(--warning)', fg: 'var(--warning)', Icon: GitBranch },
  end: { tag: 'DONE', bg: 'var(--primary-weak)', bd: 'var(--primary)', fg: 'var(--primary)', Icon: CheckCircle2 }
};
const WfNode = ({ node }) => {
  const s = NODE_STYLE[node.type] || NODE_STYLE.action;
  const Ico = s.Icon;
  return (
    <div style={{ width: 148, flex: 'none', border: `1.5px solid ${s.bd}`, borderRadius: 12, background: s.bg, boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ padding: '6px 10px', borderBottom: `1px solid ${s.bd}`, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Ico size={13} style={{ color: s.fg }} />
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', color: s.fg }}>{s.tag}</span>
      </div>
      <div style={{ padding: '9px 10px', fontSize: 12.5, fontWeight: 500 }}>{node.label}</div>
    </div>
  );
};
const Connector = () => (
  <div style={{ flex: 'none', width: 30, display: 'flex', alignItems: 'center' }}>
    <svg width="30" height="16" viewBox="0 0 30 16"><line x1="0" y1="8" x2="22" y2="8" stroke="var(--primary)" strokeWidth="2" /><path d="M22 3 L29 8 L22 13 Z" fill="var(--primary)" /></svg>
  </div>
);

export const MedusaAdminPortal = ({ view }) => {
  const { products, catalogue, profitability, auth, tenantAccess, taxEnabled, setTaxEnabled, triggerNotification, refreshCatalogue } = useApp();
  const importInputRef = useRef(null);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [expandedSku, setExpandedSku] = useState(null);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const commerceScope = {
    accessToken: auth.session?.access_token,
    tenantId: tenantAccess.activeTenantId,
    siteId: tenantAccess.activeSiteId,
  };
  // Live B2B orders for the Orders view (falls back to mock in demo mode).
  const [liveOrders, setLiveOrders] = useState(null);
  useEffect(() => {
    if (!isMedusaCatalogueEnabled || !commerceScope.accessToken || !commerceScope.tenantId) { setLiveOrders(null); return undefined; }
    let cancelled = false;
    fetchOrders(commerceScope)
      .then((r) => { if (!cancelled) setLiveOrders(r.orders ?? []); })
      .catch(() => { if (!cancelled) setLiveOrders(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commerceScope.accessToken, commerceScope.tenantId, commerceScope.siteId]);
  // Live Promotions / Tax / Fulfilment / Customers (falls back to mock in demo mode).
  const [liveConfig, setLiveConfig] = useState(null);
  useEffect(() => {
    if (!isMedusaCatalogueEnabled || !commerceScope.accessToken || !commerceScope.tenantId) { setLiveConfig(null); return undefined; }
    let cancelled = false;
    fetchCommerceConfig(commerceScope)
      .then((r) => { if (!cancelled) setLiveConfig(r); })
      .catch(() => { if (!cancelled) setLiveConfig(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commerceScope.accessToken, commerceScope.tenantId, commerceScope.siteId]);
  const cfgLive = (arr) => Array.isArray(arr);

  const [selectedWf, setSelectedWf] = useState(MEDUSA_WORKFLOWS[0].id);
  const [eventLog, setEventLog] = useState([]);
  const [firing, setFiring] = useState(null);

  // Live workflow engine (registered workflows + recent executions).
  const [engine, setEngine] = useState(null);
  useEffect(() => {
    if (!isMedusaCatalogueEnabled || !commerceScope.accessToken || !commerceScope.tenantId) { setEngine(null); return undefined; }
    let cancelled = false;
    fetchEngine(commerceScope)
      .then((r) => { if (!cancelled) setEngine(r); })
      .catch(() => { if (!cancelled) setEngine(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commerceScope.accessToken, commerceScope.tenantId, commerceScope.siteId]);

  const medusaScope = {
    accessToken: auth.session?.access_token,
    tenantId: tenantAccess.activeTenantId,
    siteId: tenantAccess.activeSiteId,
  };

  const validateImportFile = async (file) => {
    setImportError(null);
    setImportResult(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setImportError(new Error('Choose a .csv file. XLSX conversion is not enabled in this validation-only phase.'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImportError(new Error('CSV exceeds the 5 MB validation limit.'));
      return;
    }
    setImportLoading(true);
    try {
      setImportResult(await validateProductImport(await file.text(), medusaScope));
    } catch (error) {
      setImportError(error);
    } finally {
      setImportLoading(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const downloadImportTemplate = async () => {
    setImportError(null);
    try {
      const blob = await downloadProductImportTemplate(medusaScope);
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = 'sightlive-product-import-template.csv';
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (error) {
      setImportError(error);
    }
  };

  /* ---------------- Products & Pricing (+ variants) ---------------- */
  if (view === 'products') {
    const liveProfitBySku = new Map((profitability.items ?? []).map(item => [item.sku, item]));
    const liveCatalogue = catalogue.source === 'medusa';
    const rows = products.map(p => {
      if (liveCatalogue) {
        const financial = liveProfitBySku.get(p.sku);
        return {
          ...p,
          costPrice: financial?.averageCost ?? null,
          sellingPrice: financial?.averageSellingPrice ?? p.sellingPrice,
          margin: financial?.marginPercent ?? null,
          profit: financial?.averageCost == null || financial?.averageSellingPrice == null
            ? null : financial.averageSellingPrice - financial.averageCost,
        };
      }
      const margin = p.sellingPrice ? ((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100 : 0;
      return { ...p, margin, profit: p.sellingPrice - p.costPrice };
    });
    const valuedMargins = rows.map(row => row.margin).filter(value => value !== null);
    const avgMargin = valuedMargins.length ? valuedMargins.reduce((a, value) => a + value, 0) / valuedMargins.length : null;
    const stockValue = liveCatalogue ? profitability.totals?.stockCostValue ?? null : rows.reduce((a, r) => a + r.costPrice * r.stockOnHand, 0);
    const retailValue = liveCatalogue ? profitability.totals?.stockRetailValue ?? null : rows.reduce((a, r) => a + r.sellingPrice * r.stockOnHand, 0);
    const potentialProfit = liveCatalogue ? profitability.totals?.potentialProfit ?? null : retailValue - stockValue;
    return (
      <Wrap>
        <Head icon={Tag} title="Products & Pricing" sub="Cost, contract price and margin per SKU — with size/colour variants as the lowest stock-keeping level."
          action={<button className="btn btn-primary" onClick={() => setShowProductForm(true)}><Plus size={16} /> New product</button>} />
        <div className="cols cols-3">
          <div className="card"><div className="card-bd"><div className="kpi-label">Avg margin</div><div className="kpi-value" style={{ color: 'var(--primary)' }}>{avgMargin === null ? 'Restricted' : `${avgMargin.toFixed(1)}%`}</div><div className="kpi-sub">server-authoritative when live</div></div></div>
          <div className="card"><div className="card-bd"><div className="kpi-label">Stock at cost</div><div className="kpi-value">{stockValue === null ? 'Restricted' : `R ${(stockValue / 1e6).toFixed(2)}m`}</div><div className="kpi-sub">requires commerce management + MFA</div></div></div>
          <div className="card"><div className="card-bd"><div className="kpi-label">Stock at retail</div><div className="kpi-value">{retailValue === null ? 'Restricted' : `R ${(retailValue / 1e6).toFixed(2)}m`}</div><div className="kpi-sub up">{potentialProfit === null ? 'Profit data unavailable' : `R ${(potentialProfit / 1e3).toFixed(0)}k potential profit`}</div></div></div>
        </div>
        {liveCatalogue && profitability.error && <div className="card"><div className="card-bd" style={{ color: 'var(--danger)' }}>Profit and cost data is unavailable: {profitability.error.message}</div></div>}
        <div className="card">
          <div className="card-hd"><h3>Price list · Contract B</h3><span className="badge badge-neutral">{rows.length} products · click a row for variants</span></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th></th><th>SKU</th><th>Product</th><th className="num">Cost</th><th className="num">Price</th><th className="num">Profit/unit</th><th className="num">Margin</th><th className="num">Stock</th><th></th></tr></thead>
              <tbody>
                {rows.map(r => {
                  const open = expandedSku === r.sku;
                  const opt = getVariantOptions(r);
                  const variants = open ? buildVariants(r) : [];
                  return (
                    <React.Fragment key={r.sku}>
                      <tr onClick={() => setExpandedSku(open ? null : r.sku)} style={{ cursor: 'pointer' }}>
                        <td style={{ width: 28 }}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                        <td className="muted">{r.sku}</td>
                        <td style={{ fontWeight: 500 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <ProductThumb sku={r.sku} name={r.name} imageUrl={r.imageUrl} size={38} style={{ width: 38, flex: '0 0 auto' }} />
                            <div>{r.name}<div className="eyebrow" style={{ marginTop: 2 }}>{opt.sizes.length} sizes · {opt.colors[0] === '—' ? 'single colour' : `${opt.colors.length} colours`}</div></div>
                          </div>
                        </td>
                        <td className="num">{r.costPrice === null ? 'Restricted' : `R ${r.costPrice.toFixed(2)}`}</td>
                        <td className="num">R {r.sellingPrice.toFixed(2)}</td>
                        <td className="num" style={{ color: 'var(--success)', fontWeight: 600 }}>{r.profit === null ? 'Restricted' : `R ${r.profit.toFixed(2)}`}</td>
                        <td className="num">{r.margin === null ? 'Restricted' : <span className={`badge ${r.margin >= 30 ? 'badge-success' : r.margin >= 18 ? 'badge-warning' : 'badge-danger'}`}>{r.margin.toFixed(0)}%</span>}</td>
                        <td className="num">{r.stockOnHand}</td>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn-icon" title="Edit product" onClick={(e) => { e.stopPropagation(); setEditProduct(r); }}><Pencil size={15} /></button>
                          <button className="btn-icon" title="Delete product" onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }} style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={9} style={{ background: 'var(--surface-2)', padding: 0 }}>
                            <div style={{ padding: '12px 16px' }}>
                              <div className="eyebrow" style={{ marginBottom: 8 }}>Variants — lowest SKU (size × colour)</div>
                              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
                                {variants.map(v => (
                                  <div key={v.sku} className="card" style={{ boxShadow: 'none', padding: '9px 11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.size}{v.color !== '—' ? ` · ${v.color}` : ''}</div>
                                      <div className="eyebrow" style={{ fontSize: 9.5 }}>{v.sku}</div>
                                    </div>
                                    <span className={`badge ${v.stock === 0 ? 'badge-danger' : v.stock < 5 ? 'badge-warning' : 'badge-success'}`}>{v.stock}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {showProductForm && <ProductFormModal onClose={() => setShowProductForm(false)} />}
        {editProduct && <ProductFormModal product={editProduct} onClose={() => setEditProduct(null)} />}
        {deleteTarget && (
          <ConfirmDialog
            title="Delete product"
            message={`Remove "${deleteTarget.name}" (${deleteTarget.sku}) from the catalogue? This cannot be undone.`}
            confirmLabel="Delete product"
            onConfirm={async () => {
              await deleteProduct(deleteTarget.id, commerceScope);
              triggerNotification('Product deleted', `${deleteTarget.name} was removed from the catalogue.`, 'success');
              refreshCatalogue();
            }}
            onClose={() => setDeleteTarget(null)}
          />
        )}
      </Wrap>
    );
  }

  /* ---------------- Inventory & Stock ---------------- */
  if (view === 'inventory') {
    const cover = (p) => Math.round((p.stockOnHand + p.stockInTransit) / (p.dailyConsumption || 1));
    const low = products.filter(p => cover(p) < 14).length;
    const reserved = (p) => Math.min(p.stockOnHand, Math.round(p.dailyConsumption * 2));
    return (
      <Wrap>
        <Head icon={Boxes} title="Inventory & Stock" sub="Multi-location stock levels and reservations across your stores." />
        <div className="cols cols-3">
          <div className="card"><div className="card-bd"><div className="kpi-label">Locations</div><div className="kpi-value">3</div><div className="kpi-sub">Store 1 · Store 2 · Central</div></div></div>
          <div className="card"><div className="card-bd"><div className="kpi-label">SKUs tracked</div><div className="kpi-value">{products.length}</div><div className="kpi-sub">with reservations</div></div></div>
          <div className="card" style={{ borderColor: low ? 'var(--primary-weak-bd)' : 'var(--border)' }}><div className="card-bd"><div className="kpi-label">Below min</div><div className="kpi-value" style={{ color: low ? 'var(--danger)' : 'var(--text)' }}>{low}</div><div className="kpi-sub">under 14-day cover</div></div></div>
        </div>
        <div className="card">
          <div className="card-hd"><h3>Stock by SKU</h3></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>SKU</th><th>Product</th><th className="num">On hand</th><th className="num">Reserved</th><th className="num">Available</th><th className="num">In transit</th><th className="num">Cover</th></tr></thead>
              <tbody>
                {products.map(p => {
                  const res = reserved(p); const cv = cover(p); const lo = cv < 14;
                  return (
                    <tr key={p.sku} className={lo ? 'row-flag' : ''}>
                      <td className="muted">{p.sku}</td>
                      <td style={{ fontWeight: 500 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <ProductThumb sku={p.sku} name={p.name} imageUrl={p.imageUrl} size={34} style={{ width: 34, flex: '0 0 auto' }} />
                          <span>{p.name}</span>
                        </div>
                      </td>
                      <td className="num">{p.stockOnHand}</td>
                      <td className="num muted">{res}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{p.stockOnHand - res}</td>
                      <td className="num muted">+{p.stockInTransit}</td>
                      <td className="num" style={{ color: lo ? 'var(--danger)' : 'var(--text)', fontWeight: lo ? 600 : 400 }}>{cv}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Wrap>
    );
  }

  /* ---------------- Orders ---------------- */
  if (view === 'orders') {
    const statusBadge = { captured: 'badge-success', authorized: 'badge-info', requires_action: 'badge-warning', draft: 'badge-warning', pending: 'badge-info' };
    const live = liveOrders !== null;
    // Normalise live B2B orders and mock orders to one row shape.
    const rows = live
      ? liveOrders.map(o => ({
          id: o.displayId ? `#${o.displayId}` : (o.id?.slice(0, 12) ?? '—'),
          customer: o.clientName || o.email || 'Customer',
          currency: (o.currencyCode || 'zar').toUpperCase(),
          total: (o.items ?? []).reduce((a, i) => a + i.unitPrice * i.qty, 0) * (o.taxEnabled === false ? 1 : 1.15),
          items: (o.items ?? []).reduce((a, i) => a + i.qty, 0),
          status: o.status || 'draft',
          fulfil: 'not_fulfilled',
          date: (o.createdAt || '').substring(0, 10),
        }))
      : MEDUSA_ORDERS;
    return (
      <Wrap>
        <Head icon={ShoppingCart} title="Orders" sub={live ? 'Live B2B orders — created from the B2B Sales storefront.' : 'B2B orders across regions and currencies.'} />
        <div className="card">
          <div className="card-hd">
            <h3>All orders</h3>
            <span className={`badge ${live ? 'badge-primary' : 'badge-neutral'}`}>{rows.length} {live ? 'live orders' : 'orders'}</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Order</th><th>Customer</th><th className="center">Cur</th><th className="num">Total</th><th className="num">Items</th><th className="center">Payment</th><th className="center">Fulfilment</th><th>Date</th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 20 }}>No orders yet — create one in B2B Sales.</td></tr>}
                {rows.map(o => (
                  <tr key={o.id}>
                    <td className="muted">{o.id}</td>
                    <td style={{ fontWeight: 500 }}>{o.customer}</td>
                    <td className="center"><span className="badge badge-neutral">{o.currency}</span></td>
                    <td className="num" style={{ fontWeight: 600 }}>{money(o.total, o.currency)}</td>
                    <td className="num">{o.items}</td>
                    <td className="center"><span className={`badge ${statusBadge[o.status] || 'badge-neutral'}`}>{String(o.status).replace(/_/g, ' ')}</span></td>
                    <td className="center muted">{String(o.fulfil).replace(/_/g, ' ')}</td>
                    <td className="muted">{o.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Wrap>
    );
  }

  /* ---------------- Promotions ---------------- */
  if (view === 'promos') {
    const sb = { active: 'badge-success', scheduled: 'badge-info', expired: 'badge-neutral' };
    const promos = liveConfig?.promotions ?? MEDUSA_PROMOTIONS;
    const live = cfgLive(liveConfig?.promotions);
    return (
      <Wrap>
        <Head icon={BadgePercent} title="Promotions" sub="Discount codes and campaign rules."
          action={<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className={`badge ${live ? 'badge-success' : 'badge-neutral'}`}>{live ? 'Live' : 'Demo data'}</span><button className="btn btn-primary" onClick={() => triggerNotification('New promotion', 'Blank promotion opened.', 'info')}><Plus size={16} /> New promotion</button></div>} />
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Applies to</th><th className="center">Status</th><th className="num">Used</th></tr></thead>
              <tbody>
                {promos.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 22 }}>No promotions yet.</td></tr>}
                {promos.map(p => (
                  <tr key={p.code}>
                    <td style={{ fontWeight: 600 }}>{p.code}</td>
                    <td>{p.type}</td>
                    <td className="muted">{p.value}</td>
                    <td className="muted">{p.applies}</td>
                    <td className="center"><span className={`badge ${sb[p.status] || 'badge-neutral'}`}>{p.status}</span></td>
                    <td className="num">{p.used}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Wrap>
    );
  }

  /* ---------------- Tax & VAT ---------------- */
  if (view === 'tax') {
    return (
      <Wrap>
        <Head icon={Percent} title="Tax & VAT" sub="Tax regions and rates. The merchant chooses whether VAT is added to quotes and invoices." />
        <div className="card">
          <div className="card-bd" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Add tax to quotes &amp; invoices</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>When off, prices are shown and billed tax-exclusive (e.g. zero-rated exports). Applies to the B2B Sales builder.</div>
            </div>
            <button role="switch" aria-checked={taxEnabled} onClick={() => setTaxEnabled(v => !v)}
              style={{ width: 52, height: 30, borderRadius: 999, border: '1px solid var(--border-strong)', background: taxEnabled ? 'var(--primary)' : 'var(--surface-3)', position: 'relative', cursor: 'pointer', flex: 'none', transition: 'background .15s' }}>
              <span style={{ position: 'absolute', top: 3, left: taxEnabled ? 25 : 3, width: 22, height: 22, borderRadius: 999, background: '#fff', transition: 'left .15s', boxShadow: 'var(--shadow-sm)' }} />
            </button>
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><h3>Tax regions</h3><div style={{ display: 'flex', gap: 8 }}><span className={`badge ${cfgLive(liveConfig?.taxRegions) ? 'badge-success' : 'badge-neutral'}`}>{cfgLive(liveConfig?.taxRegions) ? 'Live' : 'Demo data'}</span><span className={`badge ${taxEnabled ? 'badge-success' : 'badge-warning'}`}>{taxEnabled ? 'VAT applied' : 'VAT off'}</span></div></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Region</th><th className="center">Code</th><th>Tax name</th><th className="num">Rate</th><th className="center">Default</th></tr></thead>
              <tbody>
                {(liveConfig?.taxRegions ?? MEDUSA_TAX_REGIONS).length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 22 }}>No tax regions configured.</td></tr>}
                {(liveConfig?.taxRegions ?? MEDUSA_TAX_REGIONS).map((t, i) => (
                  <tr key={t.code || i}>
                    <td style={{ fontWeight: 500 }}>{t.region}</td>
                    <td className="center muted">{t.code}</td>
                    <td>{t.name}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{t.rate}%</td>
                    <td className="center">{t.default ? <span className="badge badge-primary">default</span> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Wrap>
    );
  }

  /* ---------------- Fulfilment ---------------- */
  if (view === 'fulfil') {
    return (
      <Wrap>
        <Head icon={Truck} title="Fulfilment & Shipping" sub="Providers and rates. Store handover for internal issues, couriers for B2B."
          action={<span className={`badge ${cfgLive(liveConfig?.fulfilment) ? 'badge-success' : 'badge-neutral'}`}>{cfgLive(liveConfig?.fulfilment) ? 'Live' : 'Demo data'}</span>} />
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Provider</th><th>Regions</th><th>Rate</th><th>ETA</th><th className="center">Enabled</th></tr></thead>
              <tbody>
                {(liveConfig?.fulfilment ?? MEDUSA_FULFILMENT).length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 22 }}>No fulfilment providers registered.</td></tr>}
                {(liveConfig?.fulfilment ?? MEDUSA_FULFILMENT).map((f, i) => (
                  <tr key={f.provider || i}>
                    <td style={{ fontWeight: 500 }}>{f.provider}</td>
                    <td className="muted">{f.regions}</td>
                    <td>{f.rate}</td>
                    <td className="muted">{f.eta}</td>
                    <td className="center"><span className={`badge ${f.enabled ? 'badge-success' : 'badge-neutral'}`}>{f.enabled ? 'on' : 'off'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Wrap>
    );
  }

  /* ---------------- CSV Import ---------------- */
  if (view === 'import') {
    return (
      <Wrap>
        <Head icon={Upload} title="CSV Product Import" sub="Validate a future Medusa catalogue import without writing products, prices or inventory." />
        <div className="card">
          <div className="card-bd">
            <div className="thumb" style={{ flexDirection: 'column', gap: 10, padding: '34px 20px', borderStyle: 'dashed', borderColor: 'var(--border-strong)', color: 'var(--text-muted)' }}>
              <FileSpreadsheet size={34} style={{ color: 'var(--primary)' }} />
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>Drop CageLi 2026 Prices.csv here</div>
              <div style={{ fontSize: 12.5 }}>validation only · .csv up to 5 MB · no product writes</div>
              <input ref={importInputRef} type="file" accept=".csv,text/csv" hidden onChange={(event) => validateImportFile(event.target.files?.[0])} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button className="btn btn-secondary btn-sm" onClick={downloadImportTemplate}>Download template</button>
                <button className="btn btn-primary btn-sm" disabled={importLoading} onClick={() => importInputRef.current?.click()}>{importLoading ? 'Validating…' : 'Choose CSV for dry run'}</button>
              </div>
            </div>
          </div>
        </div>
        {importError && <div className="card"><div className="card-bd" style={{ color: 'var(--danger)' }}>{importError.message}</div></div>}
        {importResult && (
          <div className="card">
            <div className="card-hd"><h3>Dry-run validation</h3><span className={`badge ${importResult.status === 'validated' ? 'badge-success' : 'badge-danger'}`}><CheckCircle2 size={13} /> {importResult.validRowCount}/{importResult.rowCount} rows valid</span></div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Row</th><th>Column</th><th>Status</th><th>Message</th></tr></thead>
                <tbody>
                  {[...(importResult.errors ?? []).map(issue => ({ ...issue, severity: 'Error' })), ...(importResult.warnings ?? []).map(issue => ({ ...issue, severity: 'Warning' }))].map((issue, index) => (
                    <tr key={`${issue.code}-${issue.row}-${index}`}><td>{issue.row || 'File'}</td><td className="muted">{issue.column ?? '—'}</td><td><span className={`badge ${issue.severity === 'Error' ? 'badge-danger' : 'badge-warning'}`}>{issue.severity}</span></td><td>{issue.message}</td></tr>
                  ))}
                  {!(importResult.errors?.length || importResult.warnings?.length) && <tr><td colSpan={4} style={{ color: 'var(--success)' }}>All rows passed validation. No data was written.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="card-bd muted" style={{ fontSize: 13 }}>{importResult.message}</div>
          </div>
        )}
      </Wrap>
    );
  }

  /* ---------------- Customers & spending limits ---------------- */
  if (view === 'customers') {
    return (
      <Wrap>
        <Head icon={Wallet} title="Customers & Spending Limits" sub="B2B company accounts, buyers and per-company spending limits."
          action={<span className={`badge ${cfgLive(liveConfig?.customers) ? 'badge-success' : 'badge-neutral'}`}>{cfgLive(liveConfig?.customers) ? 'Live' : 'Demo data'}</span>} />
        {(liveConfig?.customers ?? MEDUSA_CUSTOMERS).length === 0 && (
          <div className="card"><div className="card-bd muted" style={{ textAlign: 'center', padding: 22 }}>No B2B customer accounts yet.</div></div>
        )}
        <div className="cols cols-2">
          {(liveConfig?.customers ?? MEDUSA_CUSTOMERS).map((c, i) => {
            const hasLimit = c.limit != null && c.spent != null;
            const pct = hasLimit ? Math.min(100, Math.round((c.spent / c.limit) * 100)) : 0;
            const near = pct >= 80;
            return (
              <div key={c.id || i} className="card">
                <div className="card-bd">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{c.company}</div>
                      <div className="muted" style={{ fontSize: 12.5 }}>{c.buyers} buyer{c.buyers === 1 ? '' : 's'} · {c.currency}{c.taxExempt ? ' · tax-exempt' : ''}{c.email ? ` · ${c.email}` : ''}</div>
                    </div>
                    {c.taxExempt && <span className="badge badge-info">0% export</span>}
                  </div>
                  {hasLimit ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 14 }}>
                        <span className="muted">Spend this month</span>
                        <span className="tabular"><strong>{money(c.spent, c.currency)}</strong> / {money(c.limit, c.currency)}</span>
                      </div>
                      <div className="progress" style={{ marginTop: 8 }}><span className={near ? 'warn' : ''} style={{ width: `${pct}%`, background: near ? 'var(--warning)' : 'var(--primary)' }} /></div>
                      <div className="eyebrow" style={{ marginTop: 6, color: near ? 'var(--warning)' : 'var(--text-subtle)' }}>{pct}% of limit used</div>
                    </>
                  ) : (
                    <div className="eyebrow" style={{ marginTop: 12, color: 'var(--text-subtle)' }}>No spending limit set</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Wrap>
    );
  }

  /* ---------------- Workflows (n8n-style canvas) ---------------- */
  if (view === 'workflows') {
    const wf = MEDUSA_WORKFLOWS.find(w => w.id === selectedWf) || MEDUSA_WORKFLOWS[0];
    const engineLive = !!engine && Array.isArray(engine.workflows);
    const relTime = (iso) => {
      if (!iso) return '—';
      const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
      if (s < 60) return `${s}s ago`;
      if (s < 3600) return `${Math.round(s / 60)}m ago`;
      if (s < 86400) return `${Math.round(s / 3600)}h ago`;
      return `${Math.round(s / 86400)}d ago`;
    };
    const stateBadge = (st) => st === 'done' ? 'badge-success' : (st === 'failed' || st === 'reverted') ? 'badge-danger' : 'badge-warning';
    return (
      <Wrap>
        <Head icon={Workflow} title="Workflow Engine" sub="Durable, compensatable workflows — the actual step design, like a flow canvas. This is what makes issuing stock roll back cleanly."
          action={<span className={`badge ${engineLive ? 'badge-success' : 'badge-neutral'}`}>{engineLive ? `Live · ${engine.workflowCount} workflows registered` : 'Demo data'}</span>} />

        {/* Live engine — real registered workflows + execution history */}
        {engineLive && (
          <div className="card">
            <div className="card-hd">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Zap size={16} style={{ color: 'var(--success)' }} /><h3>Live engine</h3></div>
              <span className="badge badge-neutral">{engine.executionsTotal} execution{engine.executionsTotal === 1 ? '' : 's'} recorded</span>
            </div>
            <div className="card-bd" style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 300px', minWidth: 280 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Recent executions</div>
                <div className="table-wrap card" style={{ boxShadow: 'none' }}>
                  <table className="table">
                    <thead><tr><th>Workflow</th><th className="center">State</th><th className="num">When</th></tr></thead>
                    <tbody>
                      {engine.executions.length === 0 && <tr><td colSpan={3} className="muted" style={{ textAlign: 'center', padding: 18 }}>No durable executions recorded yet — synchronous flows don’t persist a row.</td></tr>}
                      {engine.executions.map((e) => (
                        <tr key={e.transactionId}>
                          <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>{e.workflowId}</td>
                          <td className="center"><span className={`badge ${stateBadge(e.state)}`}>{e.state}</span></td>
                          <td className="num muted" style={{ fontSize: 12 }}>{relTime(e.updatedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={{ flex: '1 1 300px', minWidth: 280 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Registered workflows ({engine.workflowCount})</div>
                <div className="table-wrap card" style={{ boxShadow: 'none', maxHeight: 280, overflowY: 'auto' }}>
                  <table className="table">
                    <thead><tr><th>ID</th><th className="num">Steps</th><th className="center">Mode</th></tr></thead>
                    <tbody>
                      {engine.workflows.map((w) => (
                        <tr key={w.id}>
                          <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5 }}>{w.id}</td>
                          <td className="num">{w.steps}</td>
                          <td className="center"><span className={`badge ${w.async ? 'badge-info' : 'badge-neutral'}`}>{w.async ? 'async' : 'sync'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="card-bd" style={{ paddingTop: 0 }}><p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Read live from the Medusa orchestrator on this tenant’s backend. The canvas below is the annotated step design for the selected saga.</p></div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {MEDUSA_WORKFLOWS.map(w => (
            <button key={w.id} onClick={() => setSelectedWf(w.id)} className={`btn btn-sm ${w.id === selectedWf ? 'btn-primary' : 'btn-secondary'}`}>
              {w.name}
              {w.status === 'retrying' && <RotateCw size={13} />}
            </button>
          ))}
        </div>
        <div className="card">
          <div className="card-hd">
            <div>
              <h3>{wf.name}</h3>
              <div className="card-sub">{wf.nodes.length} steps · {wf.compensates ? 'rolls back on failure' : 'no compensation'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className={`badge ${wf.status === 'healthy' ? 'badge-success' : 'badge-warning'}`}>{wf.status}</span>
              <span className="badge badge-neutral">{wf.runs24h} runs / 24h</span>
            </div>
          </div>
          <div className="card-bd">
            <div style={{ overflowX: 'auto', paddingBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 'max-content', padding: '6px 2px' }}>
                {wf.nodes.map((n, i) => (
                  <React.Fragment key={i}>
                    <WfNode node={n} />
                    {i < wf.nodes.length - 1 && <Connector />}
                  </React.Fragment>
                ))}
              </div>
            </div>
            {wf.compensates && (
              <div className="card" style={{ boxShadow: 'none', background: 'var(--danger-weak)', borderColor: 'var(--primary-weak-bd)', marginTop: 14 }}>
                <div className="card-bd" style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RotateCw size={15} style={{ color: 'var(--danger)' }} />
                  <span style={{ fontSize: 13 }}>On failure the saga <strong>compensates in reverse</strong> — release reservation, restore stock, void the audit entry — so state never ends up half-applied.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </Wrap>
    );
  }

  /* ---------------- Event bus (interactive) ---------------- */
  if (view === 'events') {
    const publish = (e) => {
      const time = new Date().toLocaleTimeString('en-ZA', { hour12: false });
      setEventLog(prev => [{ id: `${e.event}-${time}-${prev.length}`, event: e.event, time, subs: e.subscribers }, ...prev].slice(0, 14));
      setFiring(e.event);
      setTimeout(() => setFiring(f => (f === e.event ? null : f)), 1300);
    };
    return (
      <Wrap>
        <Head icon={Radio} title="Event Bus & Subscribers" sub="Domain events and the async subscribers that react. Publish a test event and watch it fan out."
          action={<span className={`badge ${engine ? 'badge-success' : 'badge-neutral'}`}>{engine ? 'Engine connected · Redis' : 'Demo data'}</span>} />
        <div className="cols" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
          <div className="card">
            <div className="card-hd"><h3>Events</h3></div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Event</th><th>Subscribers</th><th className="center"></th></tr></thead>
                <tbody>
                  {MEDUSA_EVENTS.map(e => {
                    const active = firing === e.event;
                    return (
                      <tr key={e.event} style={{ background: active ? 'var(--primary-weak)' : undefined, transition: 'background .2s' }}>
                        <td style={{ fontWeight: 600 }}>{e.event}</td>
                        <td>
                          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {e.subscribers.map(s => <span key={s} className={`badge ${active ? 'badge-primary' : 'badge-neutral'}`} style={{ transition: 'all .2s' }}>{s}</span>)}
                          </span>
                        </td>
                        <td className="center"><button className="btn btn-secondary btn-sm" onClick={() => publish(e)}><Zap size={13} /> Publish</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-hd"><h3>Live event stream</h3><span className="badge badge-neutral">{eventLog.length}</span></div>
            <div className="card-bd" style={{ maxHeight: 360, overflowY: 'auto', padding: 0 }}>
              {eventLog.length === 0 ? (
                <div className="muted" style={{ fontSize: 13, padding: 18 }}>No events yet — hit <strong>Publish</strong> on an event to see it flow to its subscribers.</div>
              ) : eventLog.map(l => (
                <div key={l.id} className="animate-fade-in" style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ background: 'var(--primary)' }} />{l.event}</span>
                    <span className="eyebrow">{l.time}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>→ {l.subs.join(' · ')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Wrap>
    );
  }

  return <Wrap><Head icon={Globe2} title="Admin" sub="Select a module from the sidebar." /></Wrap>;
};
