import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { downloadProductImportTemplate, validateProductImport, deleteProduct, fetchOrders, updateOrder, fetchCommerceConfig, fetchEngine, runEngineWorkflow, fetchParties, createParty, updateParty, deleteParty, fetchPurchaseOrders, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder, fetchPromotions, sendNotificationEmail, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { downloadCsv, dateStamp } from '../utils/exportCsv';
import { InlineError, InlineLoading } from './InlineState';
import { SkeletonPage } from './SkeletonLoader';
import { ProductThumb } from './ProductThumb';
import { ProductFormModal } from './ProductFormModal';
import { PromotionFormModal } from './PromotionFormModal';
import { SupplierPerformanceMatrix } from './SupplierPerformanceMatrix';
import { ReplenishmentPanel } from './ReplenishmentPanel';
import { ConfirmDialog } from './ConfirmDialog';
import {
  MEDUSA_ORDERS, MEDUSA_PROMOTIONS, MEDUSA_TAX_REGIONS, MEDUSA_CUSTOMERS,
  MEDUSA_EVENTS, MEDUSA_FULFILMENT, MEDUSA_CURRENCIES,
  buildVariants, getVariantOptions
} from '../data/mockData';
import {
  Tag, Boxes, ShoppingCart, BadgePercent, Percent, Truck, Upload, Wallet,
  Workflow, Radio, Plus, FileSpreadsheet, CheckCircle2, RotateCw, Globe2,
  ChevronRight, ChevronDown, Zap, GitBranch, Play, Pencil, Trash2,
  Factory, Loader2, X, ArrowDownLeft, ArrowUpRight, Download, Check,
  ClipboardCheck, ClipboardList, Send, PackageCheck, Printer, Mail, PenLine, RotateCcw
} from 'lucide-react';

const cur = (code) => MEDUSA_CURRENCIES.find(c => c.code === code) || MEDUSA_CURRENCIES[0];
const money = (amount, code) => `${cur(code).symbol} ${amount.toLocaleString('en-ZA')}`;
const requestMfaStepUp = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('sightlive:mfa-required'));
};

// A B2B order and its auto-derived purchase order share the same display number
// (e.g. "B2B Order #26"). This canonical key lets a status change on the PO
// propagate to the Orders + B2B Sales panels (and vice-versa).
export const orderKeyFromDisplay = (displayId) => (displayId != null && displayId !== '' ? `ord#${displayId}` : null);
export const orderKeyFromRef = (ref) => { const m = /#\s*(\d+)/.exec(String(ref || '')); return m ? `ord#${m[1]}` : null; };

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

/* ---- Real PPE-issue saga (source of truth: backend/src/workflows/ppe-issue-saga.ts) ----
   Medusa workflows are code-defined, not a visual builder, so this is the honest,
   read-only step design for the ONE real custom workflow that exists. */
const REAL_SAGA = {
  id: 'ppe-issue-saga',
  name: 'PPE issue saga',
  compensates: true,
  note: 'Validate → Reserve (compensatable) → Audit (compensatable). A downstream failure reverts in reverse.',
  nodes: [
    { label: 'ppe-validate', type: 'trigger', comp: false },
    { label: 'ppe-reserve', type: 'action', comp: true },
    { label: 'ppe-audit', type: 'action', comp: true },
    { label: 'issued', type: 'end', comp: false },
  ],
};

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
      <div style={{ padding: '9px 10px', fontSize: 12.5, fontWeight: 500 }}>{node.label}{node.comp && <span style={{ display: 'block', fontSize: 9.5, color: 'var(--danger)', marginTop: 3, fontWeight: 600 }}>↺ compensates</span>}</div>
    </div>
  );
};
const Connector = () => (
  <div style={{ flex: 'none', width: 30, display: 'flex', alignItems: 'center' }}>
    <svg width="30" height="16" viewBox="0 0 30 16"><line x1="0" y1="8" x2="22" y2="8" stroke="var(--primary)" strokeWidth="2" /><path d="M22 3 L29 8 L22 13 Z" fill="var(--primary)" /></svg>
  </div>
);

/* ---- Add / edit a trading party (customer or supplier) ---- */
const PartyModal = ({ type, party, scope, onClose, onSaved, triggerNotification }) => {
  const editing = !!party;
  const isSupplier = type === 'supplier';
  const [form, setForm] = useState({
    company: party?.company ?? '',
    email: party?.email && !String(party.email).endsWith('@parties.sightlive.local') ? party.email : '',
    limit: party?.limit ?? '',
    currency: party?.currency ?? 'ZAR',
    taxExempt: party?.taxExempt ?? false,
    category: party?.category ?? '',
    leadTime: party?.leadTime ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.company.trim()) { setError('A company name is required.'); return; }
    setBusy(true); setError(null);
    const limit = form.limit === '' ? null : Number(form.limit);
    try {
      if (editing) {
        await updateParty(party.id, { company: form.company, limit, currency: form.currency, taxExempt: form.taxExempt, category: form.category, leadTime: form.leadTime }, scope);
        triggerNotification('Saved', `${form.company} updated.`, 'success');
      } else {
        await createParty({ type, company: form.company, email: form.email, limit, currency: form.currency, taxExempt: form.taxExempt, category: form.category, leadTime: form.leadTime }, scope);
        triggerNotification(isSupplier ? 'Supplier added' : 'Customer added', `${form.company} created.`, 'success');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <form className="modal modal-sm" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            {isSupplier ? <Factory size={18} style={{ color: 'var(--primary)' }} /> : <Wallet size={18} style={{ color: 'var(--primary)' }} />}
            <h3>{editing ? 'Edit' : 'Add'} {isSupplier ? 'supplier' : 'customer'}</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field"><label className="field-label">Company</label>
            <input className="input" value={form.company} onChange={(e) => set('company', e.target.value)} placeholder={isSupplier ? 'DROMEX Africa' : 'Rand Colliery'} autoFocus /></div>
          {!editing && (
            <div className="field"><label className="field-label">Contact email <span className="muted">(optional)</span></label>
              <input type="email" className="input" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="procurement@company.co.za" /></div>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '2 1 160px' }}><label className="field-label">{isSupplier ? 'Purchase limit' : 'Spend limit'} (per month)</label>
              <input type="number" min="0" step="100" className="input" value={form.limit} onChange={(e) => set('limit', e.target.value)} placeholder="e.g. 250000" /></div>
            <div className="field" style={{ width: 96 }}><label className="field-label">Currency</label>
              <select className="select" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                <option>ZAR</option><option>USD</option><option>BWP</option><option>NAD</option>
              </select></div>
          </div>
          {isSupplier && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: '1 1 150px' }}><label className="field-label">Category <span className="muted">(optional)</span></label>
                <input className="input" value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Footwear, Gloves…" /></div>
              <div className="field" style={{ flex: '1 1 120px' }}><label className="field-label">Lead time <span className="muted">(optional)</span></label>
                <input className="input" value={form.leadTime} onChange={(e) => set('leadTime', e.target.value)} placeholder="5–7 days" /></div>
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.taxExempt} onChange={(e) => set('taxExempt', e.target.checked)} />
            {isSupplier ? 'VAT-exempt supplier (imports / zero-rated)' : 'Tax-exempt buyer (zero-rated export)'}
          </label>
          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        </div>
        <div className="modal-ft" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? <><Loader2 size={15} className="spin" /> Saving…</> : (editing ? 'Save changes' : `Add ${isSupplier ? 'supplier' : 'customer'}`)}</button>
        </div>
      </form>
    </div>
  );
};

/* ---- Create a supplier purchase order ---- */
const PurchaseOrderModal = ({ suppliers, products, scope, onClose, onSaved, triggerNotification }) => {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [reference, setReference] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [lines, setLines] = useState([]);
  const [pick, setPick] = useState({ productId: products[0]?.id ?? '', qty: 1, unitCost: products[0]?.costPrice ?? 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [productSearch, setProductSearch] = useState('');

  const filteredProducts = (() => {
    const q = productSearch.trim().toLowerCase();
    // Prefer the SKUs linked to the chosen supplier (keeping unlinked ones
    // pickable); fall back to the full list if none are linked yet.
    const linked = products.filter((p) => !p.supplierId || p.supplierId === supplierId);
    const base = linked.length ? linked : products;
    if (!q) return base;
    return base.filter((p) => `${p.sku} ${p.name}`.toLowerCase().includes(q));
  })();

  const total = lines.reduce((a, l) => a + l.qty * l.unitCost, 0);
  const addLine = () => {
    const p = products.find((x) => x.id === pick.productId);
    if (!p || pick.qty <= 0) return;
    setLines((prev) => [...prev.filter((l) => l.productId !== p.id), { productId: p.id, sku: p.sku, name: p.name, imageUrl: p.imageUrl, stockOnHand: p.stockOnHand ?? 0, qty: Number(pick.qty), unitCost: Number(pick.unitCost) || 0 }]);
    const next = products[0];
    setPick({ productId: next?.id ?? '', qty: 1, unitCost: next?.costPrice ?? 0 });
  };
  const onPickProduct = (id) => { const p = products.find((x) => x.id === id); setPick({ productId: id, qty: 1, unitCost: p?.costPrice ?? 0 }); };

  const submit = async () => {
    if (!supplierId) { setError('Choose a supplier.'); return; }
    if (!lines.length) { setError('Add at least one line item.'); return; }
    setBusy(true); setError(null);
    try {
      const supplier = suppliers.find((s) => s.id === supplierId);
      await createPurchaseOrder({ supplierId, supplierName: supplier?.company, currency: supplier?.currency || 'ZAR', reference, expectedDate: expectedDate || null, lines }, scope);
      triggerNotification('Purchase order created', `PO to ${supplier?.company} · ${lines.length} line(s).`, 'success');
      onSaved(); onClose();
    } catch (err) { setError(err.message || 'Could not create the PO.'); setBusy(false); }
  };

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="modal" style={{ maxWidth: 620, maxHeight: 'min(82vh, 560px)', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, padding: '12px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><ClipboardCheck size={18} style={{ color: 'var(--primary)' }} /><h3>New purchase order</h3></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: '1 1 auto', overflowY: 'auto', padding: '14px 18px' }}>
          {suppliers.length === 0 && <div style={{ color: 'var(--warning)', fontSize: 13 }}>Add a supplier first (Suppliers tab).</div>}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '2 1 220px', margin: 0 }}><label className="field-label" style={{ marginBottom: 4 }}>Supplier</label>
              <select className="select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company}</option>)}
              </select></div>
            <div className="field" style={{ flex: '1 1 130px', margin: 0 }}><label className="field-label" style={{ marginBottom: 4 }}>Expected date</label>
              <input type="date" className="input" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></div>
          </div>
          <div className="field" style={{ margin: 0 }}><label className="field-label" style={{ marginBottom: 4 }}>Reference <span className="muted">(optional)</span></label>
            <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. Q3 boot restock" /></div>

          {/* Line builder */}
          <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
            <div className="card-bd" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', padding: 10 }}>
              <div className="field" style={{ flex: '2 1 200px', margin: 0 }}><label className="field-label" style={{ marginBottom: 4 }}>Product</label>
                <input className="input" style={{ marginBottom: 6 }} placeholder="Search SKU or name…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
                <select className="select" value={pick.productId} onChange={(e) => onPickProduct(e.target.value)}>
                  {filteredProducts.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}{p.costPrice != null ? ` (R${Number(p.costPrice).toFixed(2)})` : ''}</option>)}
                </select></div>
              <div className="field" style={{ width: 70, margin: 0 }}><label className="field-label" style={{ marginBottom: 4 }}>Qty</label>
                <input type="number" min="1" className="input" value={pick.qty} onChange={(e) => setPick({ ...pick, qty: parseInt(e.target.value) || 0 })} /></div>
              <div className="field" style={{ width: 110, margin: 0 }}><label className="field-label" style={{ marginBottom: 4 }}>Unit cost</label>
                <input type="number" min="0" step="0.01" className="input" value={pick.unitCost} onChange={(e) => setPick({ ...pick, unitCost: parseFloat(e.target.value) || 0 })} /></div>
              <button className="btn btn-secondary" onClick={addLine} disabled={!products.length}><Plus size={15} /> Add</button>
            </div>
          </div>

          {lines.length > 0 && (
            <div className="table-wrap card" style={{ boxShadow: 'none' }}>
              <table className="table">
                <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Unit</th><th className="num">Line</th><th></th></tr></thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.productId}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <ProductThumb sku={l.sku} name={l.name} imageUrl={l.imageUrl} size={34} style={{ width: 34, flex: '0 0 auto' }} />
                          <div><div style={{ fontWeight: 500 }}>{l.name}</div><div className="eyebrow">{l.sku} · stock {l.stockOnHand ?? 0}</div></div>
                        </div>
                      </td>
                      <td className="num">{l.qty}</td>
                      <td className="num">R {l.unitCost.toFixed(2)}</td>
                      <td className="num" style={{ fontWeight: 600 }}>R {(l.qty * l.unitCost).toLocaleString('en-ZA')}</td>
                      <td className="center"><button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setLines((prev) => prev.filter((x) => x.productId !== l.productId))} aria-label="Remove line"><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr style={{ fontWeight: 700, borderTop: '2px solid var(--border-strong)' }}><td colSpan={3}>Total</td><td className="num">R {total.toLocaleString('en-ZA')}</td><td></td></tr></tfoot>
              </table>
            </div>
          )}
          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        </div>
        <div className="modal-ft" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '10px 18px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !lines.length || !supplierId}>{busy ? <><Loader2 size={15} className="spin" /> Creating…</> : 'Create PO'}</button>
        </div>
      </div>
    </div>
  );
};

/* ---- Receive a PO: capture units actually received (short or over) ---- */
const ReceivePoModal = ({ po, busy, onClose, onConfirm }) => {
  const lines = po.lines ?? [];
  const [qty, setQty] = useState(() => {
    const init = {};
    lines.forEach((l, i) => { init[l.sku ?? i] = Math.floor(Number(l.qty ?? 0)); });
    return init;
  });
  const [dmg, setDmg] = useState({});
  const key = (l, i) => l.sku ?? i;
  const set = (k, v) => {
    const next = Math.max(0, parseInt(v) || 0);
    setQty((q) => ({ ...q, [k]: next }));
    setDmg((d) => ({ ...d, [k]: Math.min(next, d[k] ?? 0) }));
  };
  const setD = (k, v, received) => setDmg((d) => ({ ...d, [k]: Math.min(received, Math.max(0, parseInt(v) || 0)) }));
  const anyDiff = lines.some((l, i) => (qty[key(l, i)] ?? 0) !== Math.floor(Number(l.qty ?? 0))) || Object.values(dmg).some((v) => v > 0);
  const submit = () => onConfirm(
    lines.map((l, i) => ({ sku: l.sku, qty: qty[key(l, i)] ?? 0 })),
    lines.map((l, i) => ({ sku: l.sku, qty: dmg[key(l, i)] ?? 0 })).filter((x) => x.qty > 0),
  );

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><PackageCheck size={18} style={{ color: 'var(--primary)' }} /><h3>Receive stock — {po.supplier}</h3></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="modal-bd">
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Confirm the units actually delivered. Short or over deliveries are captured against the order and the received quantity is what’s added to stock.</p>
          <div className="table-wrap card" style={{ boxShadow: 'none' }}>
            <table className="table">
              <thead><tr><th>Item</th><th className="num">Ordered</th><th className="num">Received</th><th className="num" title="Damaged in transit — received but unusable, not added to stock">Damaged</th><th className="center">Δ</th></tr></thead>
              <tbody>
                {lines.map((l, i) => {
                  const ordered = Math.floor(Number(l.qty ?? 0));
                  const rec = qty[key(l, i)] ?? 0;
                  const diff = rec - ordered;
                  return (
                    <tr key={key(l, i)}>
                      <td>{l.name || l.sku}<div className="eyebrow">{l.sku}</div></td>
                      <td className="num muted">{ordered}</td>
                      <td className="num"><input type="number" min="0" className="input" style={{ width: 76, padding: '4px 8px', textAlign: 'right' }} value={rec} onChange={(e) => set(key(l, i), e.target.value)} /></td>
                      <td className="num"><input type="number" min="0" max={rec} className="input" style={{ width: 72, padding: '4px 8px', textAlign: 'right' }} value={dmg[key(l, i)] ?? 0} onChange={(e) => setD(key(l, i), e.target.value, rec)} /></td>
                      <td className="center">{diff === 0 ? <span className="muted">—</span> : <span className={`badge ${diff < 0 ? 'badge-warning' : 'badge-info'}`}>{diff > 0 ? `+${diff} over` : `${diff} short`}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {anyDiff && <div style={{ fontSize: 12.5, color: 'var(--warning)', marginTop: 10 }}>Quantities differ from the order — this is recorded as a short/over receipt.</div>}
        </div>
        <div className="modal-ft" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? <><Loader2 size={15} className="spin" /> Receiving…</> : 'Confirm receipt'}</button>
        </div>
      </div>
    </div>
  );
};

/* ---- Report a quality return against a received PO (feeds supplier scorecard) ---- */
const QualityReturnModal = ({ po, busy, onClose, onConfirm }) => {
  const parse = (rl) => (Array.isArray(rl) ? rl : (typeof rl === 'string' ? (() => { try { return JSON.parse(rl); } catch { return []; } })() : []));
  const rl = parse(po.receivedLines);
  const lines = rl.length ? rl : (po.lines ?? []).map((l) => ({ sku: l.sku, name: l.name, received: Math.floor(Number(l.qty ?? 0)) }));
  const [ret, setRet] = useState(() => {
    const initial = {};
    lines.forEach((line, index) => { initial[line.sku ?? index] = Math.max(0, Number(line.returned ?? 0)); });
    return initial;
  });
  const [note, setNote] = useState('');
  const key = (l, i) => l.sku ?? i;
  const setR = (k, v, max) => setRet((r) => ({ ...r, [k]: Math.min(max, Math.max(0, parseInt(v) || 0)) }));
  const total = Object.values(ret).reduce((a, b) => a + b, 0);
  const hasChange = lines.some((line, index) => Number(ret[key(line, index)] ?? 0) !== Number(line.returned ?? 0));
  const submit = () => onConfirm(lines.map((l, i) => ({ sku: l.sku, qty: ret[key(l, i)] ?? 0 })), note.trim());
  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><RotateCcw size={18} style={{ color: 'var(--primary)' }} /><h3>Quality return — {po.supplier}</h3></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="modal-bd">
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Record units returned/rejected on quality inspection. Logged against this supplier's scorecard.</p>
          <div className="table-wrap card" style={{ boxShadow: 'none' }}>
            <table className="table">
              <thead><tr><th>Item</th><th className="num">Received</th><th className="num">Return (quality)</th></tr></thead>
              <tbody>
                {lines.map((l, i) => {
                  const rec = Number(l.received ?? l.qty ?? 0);
                  const maxReturnable = Math.max(0, rec - Number(l.damaged ?? 0));
                  return (
                    <tr key={key(l, i)}>
                      <td>{l.name || l.sku}<div className="eyebrow">{l.sku}</div></td>
                      <td className="num muted">{rec}</td>
                      <td className="num"><input type="number" min="0" max={maxReturnable} className="input" style={{ width: 84, padding: '4px 8px', textAlign: 'right' }} value={ret[key(l, i)] ?? 0} onChange={(e) => setR(key(l, i), e.target.value, maxReturnable)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label className="field-label">Reason / note</label>
            <textarea className="textarea" rows={2} placeholder="e.g. sole delamination on 3 pairs, stitching defect" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="modal-ft" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !hasChange}>{busy ? <><Loader2 size={15} className="spin" /> Saving…</> : `Save ${total} return${total === 1 ? '' : 's'}`}</button>
        </div>
      </div>
    </div>
  );
};

export const MedusaAdminPortal = ({ view }) => {
  const { products, receiveStockDirectly, catalogue, profitability, auth, tenantAccess, taxEnabled, setTaxEnabled, triggerNotification, refreshCatalogue, orderStatusOverrides, setOrderStatusOverride } = useApp();
  const importInputRef = useRef(null);
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importDryRun, setImportDryRun] = useState(null);
  const [importSummary, setImportSummary] = useState(null);
  const [importErrors, setImportErrors] = useState([]);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [productActionBusy, setProductActionBusy] = useState(false);
  const [expandedSku, setExpandedSku] = useState(null);

  const commerceScope = {
    accessToken: auth.session?.access_token,
    tenantId: tenantAccess.activeTenantId,
    siteId: tenantAccess.activeSiteId,
  };

  // Profitability is a protected read, so it deliberately does not use the
  // generic write-error popup in catalogueClient. When a commerce manager
  // opens Products & Pricing at aal1, offer the authenticator immediately and
  // keep an explicit button in the error state in case they dismiss it.
  useEffect(() => {
    if (view !== 'products' || profitability.error?.code !== 'mfa_required') return undefined;
    const timer = window.setTimeout(requestMfaStepUp, 0);
    return () => window.clearTimeout(timer);
  }, [view, profitability.error]);

  // Orders — live list from Medusa.
  const [liveOrders, setLiveOrders] = useState(null);
  const [ordersReloadKey, setOrdersReloadKey] = useState(0);
  const reloadOrders = () => setOrdersReloadKey((k) => k + 1);
  useEffect(() => {
    if (!isMedusaCatalogueEnabled || !commerceScope.accessToken || !commerceScope.tenantId) {
      setLiveOrders(null);
      return undefined;
    }
    let cancelled = false;
    fetchOrders(commerceScope)
      .then((r) => { if (!cancelled) { setLiveOrders(r.orders ?? []); setErr?.('orders', null); } })
      .catch((e) => { if (!cancelled) { setLiveOrders(null); setErr?.('orders', e); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commerceScope.accessToken, commerceScope.tenantId, commerceScope.siteId, ordersReloadKey]);

  // Promotions / price markdowns.
  const [promotions, setPromotions] = useState(null);
  const [promoReloadKey, setPromoReloadKey] = useState(0);
  const reloadPromo = () => setPromoReloadKey((k) => k + 1);
  useEffect(() => {
    if (!isMedusaCatalogueEnabled || !commerceScope.accessToken || !commerceScope.tenantId) { setPromotions(null); return undefined; }
    let cancelled = false;
    fetchPromotions(commerceScope)
      .then((r) => { if (!cancelled) setPromotions(r.promotions ?? []); })
      .catch((e) => { if (!cancelled) { setPromotions(null); setErr('promos', e); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commerceScope.accessToken, commerceScope.tenantId, commerceScope.siteId, promoReloadKey]);

  // Store config (tax regions, currencies, etc.)
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
  // Shared PO status → badge map, used by the Orders and Fulfilment tabs.
  const poStatusBadge = { draft: 'badge-neutral', submitted: 'badge-warning', pending_approval: 'badge-warning', approved: 'badge-info', sent: 'badge-info', received: 'badge-success', rejected: 'badge-danger', cancelled: 'badge-neutral' };

  // Active promo per SKU (most recent wins) for the stock-table lookup.
  const promoBySku = (() => {
    const m = new Map();
    (promotions ?? []).forEach((p) => { if (p.status === 'active') m.set(p.sku, p); });
    return m;
  })();

  // Workflow engine status.
  const [engine, setEngine] = useState(null);
  const [engineReloadKey, setEngineReloadKey] = useState(0);
  const [runningWf, setRunningWf] = useState(false);
  const [lastRun, setLastRun] = useState(null);
  const [runSku, setRunSku] = useState('');
  const [runQty, setRunQty] = useState(5);
  useEffect(() => {
    if (!isMedusaCatalogueEnabled || !commerceScope.accessToken || !commerceScope.tenantId) { setEngine(null); return undefined; }
    let cancelled = false;
    fetchEngine(commerceScope)
      .then((r) => { if (!cancelled) setEngine(r); })
      .catch(() => { if (!cancelled) setEngine(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commerceScope.accessToken, commerceScope.tenantId, commerceScope.siteId, engineReloadKey]);

  // Trading parties (customers + suppliers) with editable spend/purchase limits.
  const [parties, setParties] = useState(null);
  const [partiesReloadKey, setPartiesReloadKey] = useState(0);
  const [partyModal, setPartyModal] = useState(null); // { type, party? }
  const [partyDelete, setPartyDelete] = useState(null);
  // Load errors surfaced visually (in-panel), not just as toasts.
  const [dataErr, setDataErr] = useState({});
  const setErr = (k, e) => setDataErr((p) => ({ ...p, [k]: e ? (e.message || String(e)) : null }));
  useEffect(() => {
    if (!isMedusaCatalogueEnabled || !commerceScope.accessToken || !commerceScope.tenantId) { setParties(null); return undefined; }
    let cancelled = false;
    fetchParties(commerceScope)
      .then((r) => { if (!cancelled) { setParties(r); setErr('parties', null); } })
      .catch((e) => { if (!cancelled) { setParties(null); setErr('parties', e); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commerceScope.accessToken, commerceScope.tenantId, commerceScope.siteId, partiesReloadKey]);
  const reloadParties = () => setPartiesReloadKey((k) => k + 1);
  const doDeleteParty = async (p) => {
    await deleteParty(p.id, commerceScope);
    triggerNotification('Removed', `${p.company} deleted.`, 'success');
    reloadParties();
  };

  // Supplier purchase orders.
  const [purchaseOrders, setPurchaseOrders] = useState(null);
  const [poReloadKey, setPoReloadKey] = useState(0);
  const [showPoModal, setShowPoModal] = useState(false);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [eventLog, setEventLog] = useState([]);
  const [firing, setFiring] = useState(null);
  const [poDelete, setPoDelete] = useState(null);
  const [poReceive, setPoReceive] = useState(null);
  const [poQuality, setPoQuality] = useState(null);
  const [poBusyId, setPoBusyId] = useState(null);
  useEffect(() => {
    if (!isMedusaCatalogueEnabled || !commerceScope.accessToken || !commerceScope.tenantId) { setPurchaseOrders(null); return undefined; }
    let cancelled = false;
    fetchPurchaseOrders(commerceScope)
      .then((r) => { if (!cancelled) { setPurchaseOrders(r.orders ?? []); setErr('po', null); } })
      .catch((e) => { if (!cancelled) { setPurchaseOrders(null); setErr('po', e); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commerceScope.accessToken, commerceScope.tenantId, commerceScope.siteId, poReloadKey]);
  const reloadPo = () => setPoReloadKey((k) => k + 1);
  const NOTE = { submit: 'submitted for approval', send: 'sent to supplier', cancel: 'cancelled' };

  // Product lookups built once per render — used for name display AND to price
  // order lines without an O(orders × items × products) find() scan.
  const productNameMap = React.useMemo(() => {
    const m = new Map();
    for (const p of products) { if (p.id) m.set(p.id, p.name); if (p.sku) m.set(p.sku, p.name); }
    return m;
  }, [products]);
  const productBySku = React.useMemo(() => {
    const bySku = new Map(); const byName = new Map();
    for (const p of products) { if (p.sku) bySku.set(p.sku, p); if (p.name) byName.set(p.name.toLowerCase(), p); }
    return { bySku, byName };
  }, [products]);

  // The catalogue read strips cost (it is a protected read), so merge the linked
  // cost back in from the profit data by SKU. Purchase orders and replenishment
  // then default the unit cost to the loaded cost instead of 0, so buyers don't
  // key in a different price than what the SKU↔supplier link was set up with.
  const costBySku = React.useMemo(() => {
    const m = new Map();
    for (const it of (profitability.items ?? [])) {
      const c = it.averageCost ?? it.costPrice ?? null;
      if (it.sku && c != null) m.set(it.sku, c);
    }
    return m;
  }, [profitability.items]);
  const productsWithCost = React.useMemo(
    () => products.map((p) => ({ ...p, costPrice: p.costPrice ?? costBySku.get(p.sku) ?? null })),
    [products, costBySku],
  );

  const poAction = async (po, action, extra = {}) => {
    setPoBusyId(po.id);
    const newStatus = action === 'receive'
      ? 'received'
      : (action === 'approve'
          ? 'approved'
          : (action === 'submit'
              ? 'pending_approval'
              : (action === 'send'
                  ? 'sent'
                  : (action === 'reject'
                      ? 'rejected'
                      : (action === 'cancel' ? 'cancelled' : action)))));
    const rawId = po.rawOrderId || String(po.id).replace(/^b2b-/, '');

    // Persist status override to AppContext & localStorage, including the shared
    // "ord#NN" key so the Orders + B2B Sales panels track a received PO too.
    if (setOrderStatusOverride) {
      setOrderStatusOverride(po.id, newStatus);
      setOrderStatusOverride(rawId, newStatus);
      setOrderStatusOverride(`b2b-${rawId}`, newStatus);
      if (po.reference) setOrderStatusOverride(po.reference, newStatus);
      const sharedKey = orderKeyFromDisplay(po.displayId) || orderKeyFromRef(po.reference);
      if (sharedKey) setOrderStatusOverride(sharedKey, newStatus);
    }

    try {
      if (String(po.id).startsWith('b2b-') || po.isB2B) {
        if (action === 'approve') {
          po.status = 'approved';
          po.approvedBy = auth?.user?.email || 'Mine Manager';
          triggerNotification('PO Approved', `Purchase Order for ${po.supplier} approved. Ready to receive.`, 'success');
        } else if (action === 'receive') {
          po.status = 'received';
          if (receiveStockDirectly && po.lines) {
            receiveStockDirectly(po.lines);
          }
          triggerNotification('Stock received', `${po.supplier}: Stock added to inventory and order receipted.`, 'success');
        } else {
          po.status = action;
          triggerNotification('Purchase order updated', `${po.supplier} PO ${action}.`, 'success');
        }

        // Optimistically update liveOrders
        setLiveOrders((prev) => {
          if (!prev) return prev;
          return prev.map((o) => (o.id === rawId || `b2b-${o.id}` === po.id ? { ...o, status: newStatus } : o));
        });

        // Persist to backend
        await updateOrder(rawId, { action, ...extra }, commerceScope).catch((err) => {
          console.warn('Backend updateOrder error:', err);
        });

        refreshCatalogue();
      } else {
        const r = await updatePurchaseOrder(po.id, { action, ...extra }, commerceScope);
        if (action === 'receive') {
          if (receiveStockDirectly && po.lines) {
            receiveStockDirectly(po.lines);
          }
          triggerNotification('Stock received', `${po.supplier}: Stock added to on-hand inventory.`, 'success');
          refreshCatalogue();
        } else {
          triggerNotification('Purchase order', `${po.supplier} ${NOTE[action] || action}.`, 'success');
        }
        setPurchaseOrders((prev) => {
          if (!prev) return prev;
          return prev.map((p) => (p.id === po.id ? { ...p, status: newStatus } : p));
        });
      }
    } catch (err) {
      triggerNotification('Action failed', err.message || 'Could not update the PO.', 'danger');
    } finally { setPoBusyId(null); }
  };
  const doDeletePo = async (po) => {
    await deletePurchaseOrder(po.id, commerceScope);
    triggerNotification('PO deleted', `${po.supplier} purchase order removed.`, 'success');
    reloadPo();
  };
  // Printable PO document (includes the approval signature when present).
  const printPo = (po) => {
    const w = window.open('', '_blank');
    if (!w) { triggerNotification('Popup blocked', 'Allow popups to print the PO.', 'warning'); return; }
    const rows = (po.lines ?? []).map((l) => `<tr><td>${l.name || ''}</td><td>${l.sku || ''}</td><td style="text-align:right">${l.qty}</td><td style="text-align:right">R ${Number(l.unit_cost || 0).toFixed(2)}</td><td style="text-align:right">R ${(l.qty * (l.unit_cost || 0)).toLocaleString('en-ZA')}</td></tr>`).join('');
    const sig = po.approvalSignature ? `<img src="${po.approvalSignature}" alt="signature" style="height:60px"/>` : '<span style="color:#999">— pending —</span>';
    w.document.write(`<html><head><title>PO ${po.reference || po.id.slice(0, 8)} — SightLive</title><style>
      body{font-family:Inter,Arial,sans-serif;color:#111;padding:32px;font-size:12.5px}
      h1{font-size:20px;margin:0}.muted{color:#666}.row{display:flex;justify-content:space-between;margin-bottom:18px}
      table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:7px 9px;border-bottom:1px solid #ddd}
      th{background:#f5f5f4;text-transform:uppercase;font-size:9.5px;letter-spacing:.05em;text-align:left}
      tfoot td{font-weight:700;border-top:2px solid #999}
      .sign{margin-top:34px;display:flex;gap:60px}.sign div{border-top:1px solid #333;padding-top:6px;min-width:220px}
    </style></head><body>
      <div class="row"><div><h1>Purchase Order</h1><div class="muted">${po.reference || po.id.slice(0, 8)} · issued ${(po.createdAt || '').slice(0, 10)}</div></div>
        <div style="text-align:right"><strong>SightLive · CageLi PPE</strong><div class="muted">Status: ${po.status}</div>${po.expectedDate ? `<div class="muted">Expected: ${po.expectedDate}</div>` : ''}</div></div>
      <div class="muted">Supplier</div><div style="font-weight:600;font-size:15px;margin-bottom:8px">${po.supplier}</div>
      <table><thead><tr><th>Product</th><th>SKU</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Line</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4">Total (${po.currency})</td><td style="text-align:right">R ${Number(po.total || 0).toLocaleString('en-ZA')}</td></tr></tfoot></table>
      <div class="sign"><div>${sig}<br/>Approved by: ${po.approvedBy || '—'}${po.approvedAt ? ' · ' + po.approvedAt.slice(0, 10) : ''}</div>
        <div style="min-width:220px">&nbsp;<br/>Supplier acceptance</div></div>
    </body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };
  // Email the PO to the supplier via AgentMail (server-built template), then
  // mark it sent. If the supplier has no email on file, fall back to the
  // merchant's own mail client (mailto) so the send can still be done manually.
  const emailPo = async (po) => {
    const supplier = (parties?.suppliers ?? []).find((s) => s.id === po.supplierId);
    const to = supplier?.email && !String(supplier.email).endsWith('parties.sightlive.local') ? supplier.email : '';
    if (to) {
      const r = await sendNotificationEmail('purchase_order', po.id, commerceScope);
      if (r?.sent) triggerNotification('PO emailed', `Sent to ${to}.`, 'success');
      else if (r?.skipped) triggerNotification('PO marked sent', 'Email isn’t configured yet — set AGENTMAIL keys to email suppliers automatically.', 'info');
      else triggerNotification('Email not sent', r?.error || 'Could not email the supplier; marking as sent.', 'warning');
    } else {
      const lines = (po.lines ?? []).map((l) => `- ${l.name} (${l.sku}) x${l.qty} @ R${Number(l.unit_cost || 0).toFixed(2)}`).join('%0D%0A');
      const subject = encodeURIComponent(`Purchase Order ${po.reference || po.id.slice(0, 8)} — SightLive`);
      const body = `Dear ${po.supplier},%0D%0A%0D%0APlease find our purchase order below.%0D%0A%0D%0A${lines}%0D%0A%0D%0ATotal: ${po.currency} ${Number(po.total || 0).toLocaleString('en-ZA')}%0D%0A${po.expectedDate ? 'Expected delivery: ' + po.expectedDate + '%0D%0A' : ''}%0D%0AApproved by ${po.approvedBy || 'management'}.%0D%0A%0D%0ARegards,%0D%0ASightLive Procurement`;
      window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
    }
    poAction(po, 'send', to ? { email: to } : {});
  };

  const runWorkflow = async (fail) => {
    setRunningWf(true); setLastRun(null);
    try {
      const sku = runSku.trim() || (products[0]?.sku ?? 'DROMEX-BOOT');
      const quantity = Number(runQty) > 0 ? Number(runQty) : 5;
      const res = await runEngineWorkflow({ quantity, sku, fail }, commerceScope);
      setLastRun(res);
      triggerNotification(
        fail ? 'Saga compensated' : 'Workflow executed',
        fail ? `ppe-issue-saga rolled back in reverse (state: ${res.state}).` : `ppe-issue-saga completed (state: ${res.state}, txn ${String(res.transactionId).slice(0, 12)}…).`,
        fail ? 'warning' : 'success',
      );
      setTimeout(() => setEngineReloadKey((k) => k + 1), 600); // let the execution row persist
    } catch (err) {
      triggerNotification('Workflow failed', err.message || 'Could not execute the workflow.', 'danger');
    } finally {
      setRunningWf(false);
    }
  };

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
  // While the live catalogue is loading, show the skeleton (matching the Suspense
  // fallback) instead of an empty/zeroed table — the catalogue-backed views.
  if ((view === 'products' || view === 'inventory') && catalogue.loading && products.length === 0) {
    return <SkeletonPage />;
  }

  if (view === 'products') {
    const liveProfitBySku = new Map((profitability.items ?? []).map(item => [item.sku, item]));
    const liveCatalogue = catalogue.source === 'medusa';
    const rows = products.map(p => {
      const financial = liveProfitBySku.get(p.sku);
      let costPrice = financial?.averageCost ?? p.costPrice ?? null;
      let sellingPrice = financial?.averageSellingPrice ?? p.sellingPrice ?? 0;
      let profit = (costPrice != null && sellingPrice != null)
        ? (sellingPrice - costPrice)
        : (financial?.averageCost != null && financial?.averageSellingPrice != null
            ? financial.averageSellingPrice - financial.averageCost
            : (p.sellingPrice && p.costPrice != null ? p.sellingPrice - p.costPrice : null));
      let margin = financial?.marginPercent ?? (sellingPrice > 0 && costPrice != null ? ((sellingPrice - costPrice) / sellingPrice) * 100 : (p.sellingPrice && p.costPrice != null ? ((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100 : null));

      // Apply an active promotion: the discount reduces the COST BASIS
      const promo = promoBySku.get(p.sku) || null;
      let promoCost = costPrice;
      let promoMargin = margin;
      let promoProfit = profit;
      if (promo && costPrice != null && sellingPrice) {
        promoCost = costPrice * (1 - Number(promo.discountPct) / 100);
        promoMargin = sellingPrice > 0 ? ((sellingPrice - promoCost) / sellingPrice) * 100 : null;
        promoProfit = sellingPrice - promoCost;
      }
      return { ...p, costPrice, sellingPrice, margin, profit, promo, promoCost, promoMargin, promoProfit };
    });
    const valuedMargins = rows.map(row => row.margin).filter(value => value !== null);
    const avgMargin = valuedMargins.length ? valuedMargins.reduce((a, value) => a + value, 0) / valuedMargins.length : null;
    const stockValue = liveCatalogue ? profitability.totals?.stockCostValue ?? null : rows.reduce((a, r) => a + r.costPrice * r.stockOnHand, 0);
    const retailValue = liveCatalogue ? profitability.totals?.stockRetailValue ?? null : rows.reduce((a, r) => a + r.sellingPrice * r.stockOnHand, 0);
    const potentialProfit = liveCatalogue ? profitability.totals?.potentialProfit ?? null : retailValue - stockValue;
    return (
      <Wrap>
        <Head icon={Tag} title="Products & Pricing" sub="Cost, contract price and margin per SKU — with size/colour variants as the lowest stock-keeping level."
          action={<div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => { downloadCsv(`sightlive-pricelist-${dateStamp()}`, [
              { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Product' }, { key: 'category', label: 'Category', map: (r) => r.category ?? '' },
              { key: 'costPrice', label: 'Cost (R)', map: (r) => (r.costPrice == null ? 'Restricted' : r.costPrice.toFixed(2)) },
              { key: 'sellingPrice', label: 'Price (R)', map: (r) => (r.sellingPrice == null ? '' : r.sellingPrice.toFixed(2)) },
              { key: 'profit', label: 'Profit/unit (R)', map: (r) => (r.profit == null ? 'Restricted' : r.profit.toFixed(2)) },
              { key: 'margin', label: 'Margin (%)', map: (r) => (r.margin == null ? 'Restricted' : r.margin.toFixed(1)) },
              { key: 'stockOnHand', label: 'Stock' },
            ], rows); triggerNotification('Export ready', `${rows.length} products exported to CSV.`, 'success'); }} disabled={!rows.length}><Download size={16} /> Export CSV</button>
            <button className="btn btn-primary" onClick={() => setShowProductForm(true)}><Plus size={16} /> New product</button>
          </div>} />
        <div className="cols cols-3">
          <div className="card"><div className="card-bd"><div className="kpi-label">Avg margin</div><div className="kpi-value" style={{ color: 'var(--primary)' }}>{avgMargin === null ? 'Restricted' : `${avgMargin.toFixed(1)}%`}</div><div className="kpi-sub">server-authoritative when live</div></div></div>
          <div className="card"><div className="card-bd"><div className="kpi-label">Stock at cost</div><div className="kpi-value">{stockValue === null ? 'Restricted' : `R ${(stockValue / 1e6).toFixed(2)}m`}</div><div className="kpi-sub">requires commerce management + MFA</div></div></div>
          <div className="card"><div className="card-bd"><div className="kpi-label">Stock at retail</div><div className="kpi-value">{retailValue === null ? 'Restricted' : `R ${(retailValue / 1e6).toFixed(2)}m`}</div><div className="kpi-sub up">{potentialProfit === null ? 'Profit data unavailable' : `R ${(potentialProfit / 1e3).toFixed(0)}k potential profit`}</div></div></div>
        </div>
        {liveCatalogue && profitability.error && (
          <div className="card">
            <div className="card-bd" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <span>Profit and cost data is unavailable: {profitability.error.message}</span>
              {profitability.error.code === 'mfa_required' && (
                <button type="button" className="btn btn-primary" onClick={requestMfaStepUp}>
                  Verify or enable MFA
                </button>
              )}
            </div>
          </div>
        )}
        <div className="card">
          <div className="card-hd"><h3>Price list · Contract B</h3><span className="badge badge-neutral">{rows.length} products · click a row for variants</span></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th></th><th>SKU</th><th>Product</th><th className="num">Cost</th><th className="num">Price</th><th className="num">Profit/unit</th><th className="num">Margin</th><th className="num">Promo</th><th className="num">Stock</th><th></th></tr></thead>
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
                        <td className="num">{r.costPrice === null ? 'Restricted' : <span style={r.promo ? { color: 'var(--danger)' } : undefined}>R {r.costPrice.toFixed(2)}</span>}</td>
                        <td className="num">R {r.sellingPrice.toFixed(2)}</td>
                        <td className="num" style={{ color: 'var(--success)', fontWeight: 600 }}>{r.profit === null ? 'Restricted' : `R ${r.profit.toFixed(2)}`}</td>
                        <td className="num">{r.margin === null ? 'Restricted' : <span className={`badge ${r.margin >= 30 ? 'badge-success' : r.margin >= 18 ? 'badge-warning' : 'badge-danger'}`}>{r.margin.toFixed(0)}%</span>}</td>
                        <td className="num">{r.promo
                          ? <span className="badge badge-warning" title="Promotion reduces the cost basis">−{Number(r.promo.discountPct)}% {String(r.promo.promoType).slice(0, 4)}</span>
                          : <span className="muted">—</span>}</td>
                        <td className="num">{r.stockOnHand}</td>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn-icon" title="Edit product" onClick={(e) => { e.stopPropagation(); setEditProduct(r); }}><Pencil size={15} /></button>
                          <button className="btn-icon" title="Delete product" onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }} style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={10} style={{ background: 'var(--surface-2)', padding: 0 }}>
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
    const liveStock = catalogue?.source === 'medusa';
    const exportInventory = () => {
      const rows = products.map((p) => {
        const res = reserved(p);
        return { ...p, _reserved: res, _available: p.stockOnHand - res, _cover: cover(p) };
      });
      downloadCsv(`sightlive-inventory-${dateStamp()}`, [
        { key: 'sku', label: 'SKU' },
        { key: 'name', label: 'Product' },
        { key: 'category', label: 'Category', map: (p) => p.category ?? '' },
        { key: 'stockOnHand', label: 'On hand' },
        { key: '_reserved', label: 'Reserved' },
        { key: '_available', label: 'Available' },
        { key: 'stockInTransit', label: 'In transit' },
        { key: '_cover', label: 'Cover (days)' },
        { key: 'costPrice', label: 'Cost (R)', map: (p) => (p.costPrice == null ? '' : p.costPrice.toFixed(2)) },
        { key: 'sellingPrice', label: 'Selling (R)', map: (p) => (p.sellingPrice == null ? '' : p.sellingPrice.toFixed(2)) },
        { key: 'stockValue', label: 'Stock value (R)', map: (p) => ((p.costPrice ?? 0) * p.stockOnHand).toFixed(2) },
      ], rows);
      triggerNotification('Export ready', `${rows.length} SKUs exported to CSV.`, 'success');
    };
    return (
      <Wrap>
        <Head icon={Boxes} title="Inventory & Stock" sub="Multi-location stock levels and reservations across your stores."
          action={<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span className={`badge ${liveStock ? 'badge-success' : 'badge-neutral'}`}>{liveStock ? 'Live' : 'Demo data'}</span><button className="btn btn-secondary" onClick={exportInventory} disabled={!products.length}><Download size={16} /> Export CSV</button></div>} />
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
    // Show a loading state instead of flashing mock data while the live orders
    // are still loading in a connected tenant.
    const expectingLive = isMedusaCatalogueEnabled && !!commerceScope.accessToken && !!commerceScope.tenantId;
    if (expectingLive && liveOrders === null && !dataErr.orders) {
      return (<Wrap><Head icon={ShoppingCart} title="Orders" sub="Live B2B orders (outbound) and purchase orders (inbound)." /><InlineLoading label="Loading orders…" /></Wrap>);
    }
    // A sale order's fulfilment status is the LIVE status of its linked mine PO
    // (keyed by the shared #NN), so a received PO heals the Orders panel even for
    // POs received before this link existed.
    const poStatusByOrderKey = {};
    (purchaseOrders ?? []).forEach((p) => {
      const k = orderKeyFromRef(p.reference);
      if (k) poStatusByOrderKey[k] = orderStatusOverrides[p.id] || orderStatusOverrides[p.reference] || orderStatusOverrides[k] || p.status;
    });
    // Normalise live B2B orders and mock orders to one row shape. Purchase orders
    // are a separate inbound (procurement) flow but the user expects them visible
    // here too, so we merge them as PO rows marked with direction: 'in'.
    const orderRows = live
      ? liveOrders.map(o => {
          const parsedItems = (o.items ?? []).map(i => {
            const prod = productBySku.bySku.get(i.sku) || (i.name && productBySku.byName.get(i.name.toLowerCase()));
            const up = Number(i.unitPrice) > 0 ? Number(i.unitPrice) : (Number(prod?.sellingPrice) > 0 ? Number(prod.sellingPrice) : 0);
            const q = Number(i.qty) > 0 ? Number(i.qty) : 1;
            return { ...i, qty: q, unitPrice: up, total: up * q };
          });

          const sub = parsedItems.reduce((a, i) => a + i.total, 0);
          const rawTotal = typeof o.total === 'number' && o.total > 0
            ? o.total
            : (typeof o.subtotal === 'number' && o.subtotal > 0
                ? (o.taxEnabled === false ? o.subtotal : o.subtotal * 1.15)
                : (sub > 0 ? (o.taxEnabled === false ? sub : sub * 1.15) : 0));

          const totalItemsCount = parsedItems.reduce((a, i) => a + i.qty, 0);

          const override = orderStatusOverrides[o.id] || orderStatusOverrides[`b2b-${o.id}`] || orderStatusOverrides[orderKeyFromDisplay(o.displayId)];
          const finalStatus = override || poStatusByOrderKey[orderKeyFromDisplay(o.displayId)] || o.status || 'pending';

          return {
            id: o.displayId ? `#${o.displayId}` : (o.id?.slice(0, 12) ?? '—'),
            direction: 'out',
            customer: o.clientName || o.email || 'Customer',
            currency: (o.currencyCode || 'zar').toUpperCase(),
            total: rawTotal,
            items: totalItemsCount > 0 ? totalItemsCount : (o.items?.length || 1),
            status: finalStatus,
            fulfil: finalStatus === 'received' ? 'received' : 'not_fulfilled',
            date: (o.createdAt || '').substring(0, 10) || new Date().toISOString().substring(0, 10),
          };
        })
      : MEDUSA_ORDERS.map(o => ({ ...o, direction: 'out' }));
    const poRows = (purchaseOrders ?? []).map(p => {
      const override = orderStatusOverrides[p.id] || orderStatusOverrides[p.reference] || orderStatusOverrides[orderKeyFromRef(p.reference)];
      const pStatus = override || p.status || 'draft';
      return {
        id: p.reference || (p.id?.slice(0, 12) ?? '—'),
        direction: 'in',
        customer: p.supplier || 'Supplier',
        currency: (p.currency || 'zar').toUpperCase(),
        total: Number(p.total ?? 0),
        items: p.lineCount ?? (p.lines ?? []).length,
        status: pStatus,
        fulfil: pStatus === 'received' ? 'received' : 'inbound',
        date: (p.createdAt || p.submittedAt || '').substring(0, 10),
      };
    });
    // Interleave sales + POs by date so the newest activity (incl. a just-created
    // PO) is actually at the top — the list claims "newest first".
    const rows = [...orderRows, ...poRows].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return (
      <Wrap>
        <Head icon={ShoppingCart} title="Orders" sub={live ? 'Live B2B orders (outbound) and purchase orders (inbound), newest first.' : 'B2B orders across regions and currencies.'}
          action={live && <button className="btn btn-secondary btn-sm" onClick={() => { reloadOrders(); reloadPo(); }} title="Refresh orders"><RotateCw size={14} /> Refresh</button>} />
        <InlineError error={dataErr.orders} onRetry={reloadOrders} title="Orders didn’t load" />
        <div className="card">
          <div className="card-hd">
            <h3>All orders</h3>
            <span className={`badge ${live ? 'badge-primary' : 'badge-neutral'}`}>{live ? `${rows.length} live · ${orderRows.length} sales · ${poRows.length} PO` : `${rows.length} orders`}</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Type</th><th>Ref</th><th>Customer / Supplier</th><th className="center">Cur</th><th className="num">Total</th><th className="num">Items</th><th className="center">Status</th><th>Date</th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 20 }}>No orders yet — create one in B2B Sales or raise a PO.</td></tr>}
                {rows.map(o => (
                  <tr key={`${o.direction}-${o.id}`}>
                    <td><span className={`badge ${o.direction === 'in' ? 'badge-info' : 'badge-primary'}`}>{o.direction === 'in' ? 'PO' : 'Sale'}</span></td>
                    <td className="muted">{o.id}</td>
                    <td style={{ fontWeight: 500 }}>{o.customer}</td>
                    <td className="center"><span className="badge badge-neutral">{o.currency}</span></td>
                    <td className="num" style={{ fontWeight: 600 }}>{money(o.total, o.currency)}</td>
                    <td className="num">{o.items}</td>
                    <td className="center"><span className={`badge ${o.direction === 'in' ? (poStatusBadge[o.status] || 'badge-neutral') : (statusBadge[o.status] || 'badge-neutral')}`}>{String(o.status).replace(/_/g, ' ')}</span></td>
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
    const sb = { active: 'badge-success', scheduled: 'badge-info', expired: 'badge-neutral', cancelled: 'badge-danger' };
    const live = promotions !== null;
    const rows = live ? (promotions ?? []) : (liveConfig?.promotions ?? MEDUSA_PROMOTIONS);
    return (
      <Wrap>
        <Head icon={BadgePercent} title="Promotions" sub="Mark a product down by a percentage — the cost basis drops so the margin narrows. Created promos go live at once and are sent to managers for visibility."
          action={<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className={`badge ${live ? 'badge-success' : 'badge-neutral'}`}>{live ? 'Live' : 'Demo data'}</span><button className="btn btn-primary" onClick={() => setShowPromoModal(true)} disabled={!live}><Plus size={16} /> New promotion</button></div>} />
        <InlineError error={dataErr.promos} onRetry={reloadPromo} title="Promotions didn’t load" />
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Product</th><th>Type</th><th className="num">Discount</th><th className="num">Cost was → now</th><th className="num">Margin impact</th><th className="center">Status</th><th>Created</th><th>Ends</th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 22 }}>{live ? 'No promotions yet — add one with “New promotion”.' : 'Connect the backend to manage promotions.'}</td></tr>}
                {rows.map((p, idx) => {
                  if (!p) return null;
                  const cost = Number(p.costAtCreate ?? 0);
                  const pct = Number(p.discountPct ?? 0);
                  const validPct = isNaN(pct) ? 0 : pct;
                  const newCost = cost * (1 - validPct / 100);
                  return (
                    <tr key={p.id || p.sku || idx}>
                      <td style={{ fontWeight: 600 }}>{p.sku || '—'}</td>
                      <td className="muted" style={{ textTransform: 'capitalize' }}>{String(p.promoType ?? 'markdown')}</td>
                      <td className="num">−{validPct}%</td>
                      <td className="num tabular muted">R {cost.toFixed(2)} → <span style={{ color: 'var(--danger)', fontWeight: 600 }}>R {isNaN(newCost) ? '0.00' : newCost.toFixed(2)}</span></td>
                      <td className="num muted">cost basis −{validPct}%</td>
                      <td className="center"><span className={`badge ${sb[p.status] || 'badge-neutral'}`}>{String(p.status || 'active').replace(/_/g, ' ')}</span></td>
                      <td className="muted">{(p.createdAt || '').substring(0, 10)}</td>
                      <td className="muted">{p.endDate ? <span style={p.expired ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>{p.endDate}{p.expired ? ' · expired' : ''}</span> : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {showPromoModal && (
          <PromotionFormModal
            products={products}
            onClose={() => setShowPromoModal(false)}
            onCreated={() => { setShowPromoModal(false); reloadPromo(); triggerNotification('Promotion sent', 'Markdown created and sent to managers.', 'success'); }}
            scope={commerceScope}
          />
        )}
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

  /* ---------------- Fulfilment (inbound from suppliers + outbound to customers) ---------------- */
  if (view === 'fulfil') {
    const live = !!parties;
    const suppliers = live ? (parties.suppliers ?? []) : [];
    const customers = live ? (parties.customers ?? []) : (liveConfig?.customers ?? MEDUSA_CUSTOMERS);
    return (
      <Wrap>
        <Head icon={Truck} title="Fulfilment & Supplier Performance" sub="Supplier scorecard from PO movements — on-time, fill, damage & quality returns — plus inbound receiving and outbound delivery."
          action={<span className={`badge ${live ? 'badge-success' : 'badge-neutral'}`}>{live ? 'Live' : 'Demo data'}</span>} />

        <SupplierPerformanceMatrix purchaseOrders={purchaseOrders || []} profitabilityItems={profitability.items || []} />

        <div className="cols cols-2">
          {/* Inbound — from suppliers */}
          <div className="card">
            <div className="card-hd"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ArrowDownLeft size={16} style={{ color: 'var(--success)' }} /><h3>Inbound · from suppliers</h3></div><span className="badge badge-neutral">{suppliers.length}</span></div>
            <div className="table-wrap">
              <table className="table mobile-stack-table">
                <thead><tr><th>Supplier</th><th>Category</th><th className="num">Lead time</th></tr></thead>
                <tbody>
                  {suppliers.length === 0 && <tr><td colSpan={3} className="muted" style={{ textAlign: 'center', padding: 20 }}>{live ? 'No suppliers yet — add them under Suppliers.' : 'Connect the backend to see inbound flows.'}</td></tr>}
                  {suppliers.map((s) => (
                    <tr key={s.id}>
                      <td data-label="Supplier" style={{ fontWeight: 500 }}>{s.company}</td>
                      <td data-label="Category" className="muted">{s.category || '—'}</td>
                      <td data-label="Lead time" className="num muted">{s.leadTime || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Inbound — open purchase orders (the actual stock-receiving flow) */}
          <div className="card">
            <div className="card-hd"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ArrowDownLeft size={16} style={{ color: 'var(--success)' }} /><h3>Inbound · open POs</h3></div><span className="badge badge-neutral">{(purchaseOrders ?? []).length}</span></div>
            <div className="table-wrap">
              <table className="table mobile-stack-table">
                <thead><tr><th>Ref</th><th>Supplier</th><th className="num">Total</th><th className="center">Status</th><th>Expected</th></tr></thead>
                <tbody>
                  {(purchaseOrders ?? []).length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 20 }}>{live ? 'No purchase orders yet — raise one under Purchase Orders.' : 'Connect the backend to see inbound POs.'}</td></tr>}
                  {(purchaseOrders ?? []).map((p) => (
                    <tr key={p.id}>
                      <td data-label="Reference" className="muted">{p.reference || (p.id?.slice(0, 12) ?? '—')}</td>
                      <td data-label="Supplier" style={{ fontWeight: 500 }}>{p.supplier || 'Supplier'}</td>
                      <td data-label="Total" className="num" style={{ fontWeight: 600 }}>{money(Number(p.total ?? 0), (p.currency || 'zar'))}</td>
                      <td data-label="Status" className="center"><span className={`badge ${poStatusBadge[p.status] || 'badge-neutral'}`}>{String(p.status || 'draft').replace(/_/g, ' ')}</span></td>
                      <td data-label="Expected" className="muted">{p.expectedDate ? String(p.expectedDate).substring(0, 10) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Outbound — to customers */}
          <div className="card">
            <div className="card-hd"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ArrowUpRight size={16} style={{ color: 'var(--primary)' }} /><h3>Outbound · to customers</h3></div><span className="badge badge-neutral">{customers.length}</span></div>
            <div className="table-wrap">
              <table className="table mobile-stack-table">
                <thead><tr><th>Customer</th><th className="center">Terms</th><th className="num">This month</th></tr></thead>
                <tbody>
                  {customers.length === 0 && <tr><td colSpan={3} className="muted" style={{ textAlign: 'center', padding: 20 }}>No customers yet.</td></tr>}
                  {customers.map((c, i) => (
                    <tr key={c.id || i}>
                      <td data-label="Customer" style={{ fontWeight: 500 }}>{c.company}</td>
                      <td data-label="Terms" className="center">{c.taxExempt ? <span className="badge badge-info">0% export</span> : <span className="muted">VAT</span>}</td>
                      <td data-label="This month" className="num tabular muted">{c.spent != null ? money(c.spent, c.currency) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Shipping providers (the rails both directions use) */}
        <div className="card">
          <div className="card-hd"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Truck size={16} style={{ color: 'var(--primary)' }} /><h3>Shipping providers</h3></div><span className={`badge ${cfgLive(liveConfig?.fulfilment) ? 'badge-success' : 'badge-neutral'}`}>{cfgLive(liveConfig?.fulfilment) ? 'Live' : 'Demo data'}</span></div>
          <div className="table-wrap">
            <table className="table mobile-stack-table">
              <thead><tr><th>Provider</th><th>Regions</th><th>Rate</th><th>ETA</th><th className="center">Enabled</th></tr></thead>
              <tbody>
                {(liveConfig?.fulfilment ?? MEDUSA_FULFILMENT).length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 22 }}>No fulfilment providers registered.</td></tr>}
                {(liveConfig?.fulfilment ?? MEDUSA_FULFILMENT).map((f, i) => (
                  <tr key={f.provider || i}>
                    <td data-label="Provider" style={{ fontWeight: 500 }}>{f.provider}</td>
                    <td data-label="Regions" className="muted">{f.regions}</td>
                    <td data-label="Rate">{f.rate}</td>
                    <td data-label="ETA" className="muted">{f.eta}</td>
                    <td data-label="Enabled" className="center"><span className={`badge ${f.enabled ? 'badge-success' : 'badge-neutral'}`}>{f.enabled ? 'on' : 'off'}</span></td>
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
    const live = !!parties;
    const rows = live ? (parties.customers ?? []) : (liveConfig?.customers ?? MEDUSA_CUSTOMERS);
    return (
      <Wrap>
        <Head icon={Wallet} title="Customers & Spending Limits" sub="Internal B2B buyers you sell PPE to. Set a monthly spend limit per company; spend is tracked live from their orders."
          action={<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span className={`badge ${live ? 'badge-success' : 'badge-neutral'}`}>{live ? 'Live' : 'Demo data'}</span>{live && <button className="btn btn-primary" onClick={() => setPartyModal({ type: 'customer' })}><Plus size={16} /> Add customer</button>}</div>} />
        <InlineError error={dataErr.parties} onRetry={reloadParties} title="Customers didn’t load" />
        {rows.length === 0 && (
          <div className="card"><div className="card-bd muted" style={{ textAlign: 'center', padding: 22 }}>No customer accounts yet.{live && ' Add your first buyer above.'}</div></div>
        )}
        <div className="cols cols-2">
          {rows.map((c, i) => {
            const hasLimit = c.limit != null;
            const spent = c.spent ?? 0;
            const pct = hasLimit && c.limit > 0 ? Math.min(100, Math.round((spent / c.limit) * 100)) : 0;
            const near = pct >= 80;
            return (
              <div key={c.id || i} className="card">
                <div className="card-bd">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{c.company}</div>
                      <div className="muted" style={{ fontSize: 12.5 }}>{c.currency}{c.taxExempt ? ' · tax-exempt' : ''}{c.email && !String(c.email).endsWith('parties.sightlive.local') ? ` · ${c.email}` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {c.taxExempt && <span className="badge badge-info">0% export</span>}
                      {live && <button className="icon-btn" style={{ width: 30, height: 30 }} title="Edit limit" onClick={() => setPartyModal({ type: 'customer', party: c })}><Pencil size={14} /></button>}
                      {live && <button className="icon-btn" style={{ width: 30, height: 30 }} title="Remove" onClick={() => setPartyDelete(c)}><Trash2 size={14} /></button>}
                    </div>
                  </div>
                  {hasLimit ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 14 }}>
                        <span className="muted">Spend this month</span>
                        <span className="tabular"><strong>{money(spent, c.currency)}</strong> / {money(c.limit, c.currency)}</span>
                      </div>
                      <div className="progress" style={{ marginTop: 8 }}><span className={near ? 'warn' : ''} style={{ width: `${pct}%`, background: near ? 'var(--warning)' : 'var(--primary)' }} /></div>
                      <div className="eyebrow" style={{ marginTop: 6, color: near ? 'var(--warning)' : 'var(--text-subtle)' }}>{pct}% of limit used</div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                      <span className="eyebrow" style={{ color: 'var(--text-subtle)' }}>No spending limit set</span>
                      {live && <button className="btn btn-secondary btn-sm" onClick={() => setPartyModal({ type: 'customer', party: c })}>Set limit</button>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {partyModal && <PartyModal {...partyModal} scope={commerceScope} triggerNotification={triggerNotification} onClose={() => setPartyModal(null)} onSaved={reloadParties} />}
        {partyDelete && <ConfirmDialog title={`Remove ${partyDelete.company}?`} message="This deletes the account from the commerce engine. Order history is retained." confirmLabel="Remove" onConfirm={() => doDeleteParty(partyDelete)} onClose={() => setPartyDelete(null)} />}
      </Wrap>
    );
  }

  /* ---------------- Suppliers (external vendors) ---------------- */
  if (view === 'suppliers') {
    const live = !!parties;
    const rows = live ? (parties.suppliers ?? []) : [];
    return (
      <Wrap>
        <Head icon={Factory} title="Suppliers" sub="External vendors the merchant sources stock from. Add suppliers to the tenant and set a monthly purchase limit for each."
          action={<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span className={`badge ${live ? 'badge-success' : 'badge-neutral'}`}>{live ? 'Live' : 'Demo data'}</span>{live && <button className="btn btn-primary" onClick={() => setPartyModal({ type: 'supplier' })}><Plus size={16} /> Add supplier</button>}</div>} />
        <InlineError error={dataErr.parties} onRetry={reloadParties} title="Suppliers didn’t load" />
        {!live && <div className="card"><div className="card-bd muted" style={{ textAlign: 'center', padding: 22 }}>Connect the live backend to manage suppliers.</div></div>}
        {live && (
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Supplier</th><th>Category</th><th>Lead time</th><th className="num">Purchase limit</th><th className="center">Tax</th><th className="center"></th></tr></thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 22 }}>No suppliers yet — add the vendors you buy stock from.</td></tr>}
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td><div style={{ fontWeight: 600 }}>{s.company}</div>{s.email && !String(s.email).endsWith('parties.sightlive.local') && <div className="eyebrow">{s.email}</div>}</td>
                      <td className="muted">{s.category || '—'}</td>
                      <td className="muted">{s.leadTime || '—'}</td>
                      <td className="num tabular">{s.limit != null ? money(s.limit, s.currency) : <span className="muted">not set</span>}</td>
                      <td className="center">{s.taxExempt ? <span className="badge badge-info">exempt</span> : <span className="muted">VAT</span>}</td>
                      <td className="center">
                        <button className="icon-btn" style={{ width: 30, height: 30 }} title="Edit" onClick={() => setPartyModal({ type: 'supplier', party: s })}><Pencil size={14} /></button>
                        <button className="icon-btn" style={{ width: 30, height: 30 }} title="Remove" onClick={() => setPartyDelete(s)}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {partyModal && <PartyModal {...partyModal} scope={commerceScope} triggerNotification={triggerNotification} onClose={() => setPartyModal(null)} onSaved={reloadParties} />}
        {partyDelete && <ConfirmDialog title={`Remove ${partyDelete.company}?`} message="This deletes the supplier from the commerce engine." confirmLabel="Remove" onConfirm={() => doDeleteParty(partyDelete)} onClose={() => setPartyDelete(null)} />}
      </Wrap>
    );
  }

  /* ---------------- Purchase Orders (inbound procurement) ---------------- */
  if (view === 'purchaseorders') {
    const live = purchaseOrders !== null || liveOrders !== null;
    const suppliers = parties?.suppliers ?? [];

    // Convert live B2B orders into Purchase Order rows with proper approval / receipt routing
    const b2bPoRows = (liveOrders ?? []).map((o) => {
      const supplierName = (o.supplier || '').trim() || 'Dromex Safety (Pty) Ltd';
      const isMine = /mine|plant|shaft|kumba|kolomela|tenke|sishen|amandelbult|thabazimbi/i.test(supplierName);

      const parsedLines = (o.items ?? []).map((i) => {
        const prod = products.find((p) => p.sku === i.sku || (i.name && p.name.toLowerCase() === i.name.toLowerCase()));
        const up = Number(i.unitPrice) > 0 ? Number(i.unitPrice) : (Number(prod?.sellingPrice) > 0 ? Number(prod.sellingPrice) : 0);
        const q = Number(i.qty) > 0 ? Number(i.qty) : 1;
        return {
          product_id: i.variant_id || i.sku,
          sku: i.sku,
          name: i.name || i.title || prod?.name || i.sku,
          qty: q,
          unit_cost: up,
        };
      });

      const calcTotal = parsedLines.reduce((sum, l) => sum + l.qty * l.unit_cost, 0);
      const orderTotal = typeof o.total === 'number' && o.total > 0 ? o.total : calcTotal;

      const override = orderStatusOverrides[`b2b-${o.id}`] || orderStatusOverrides[o.id] || (o.displayId ? orderStatusOverrides[`#${o.displayId}`] : null);
      let initialStatus = isMine ? 'pending_approval' : 'sent';
      if (override) initialStatus = override;
      else if (o.status === 'received') initialStatus = 'received';
      else if (o.status === 'approved') initialStatus = 'approved';

      return {
        id: `b2b-${o.id}`,
        supplierId: null,
        supplier: supplierName,
        isMinePlant: isMine,
        isB2B: true,
        reference: `B2B Order #${o.displayId || o.id?.slice(0, 8)} (${o.clientName || 'Storefront'})`,
        expectedDate: (o.createdAt || '').slice(0, 10),
        lines: parsedLines,
        lineCount: parsedLines.length || 1,
        total: orderTotal,
        currency: (o.currencyCode || 'ZAR').toUpperCase(),
        status: initialStatus,
        approvedBy: isMine ? (o.status === 'approved' ? 'Mine Manager' : null) : 'B2B Auto-Dispatch (External Vendor)',
        createdAt: (o.createdAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      };
    });

    const directPos = (purchaseOrders ?? []).map((p) => {
      const override = orderStatusOverrides[p.id] || orderStatusOverrides[p.reference];
      const isMine = /mine|plant|shaft|kumba|kolomela|tenke|sishen|amandelbult|thabazimbi/i.test(p.supplier || '');
      let st = override || p.status;
      // If external vendor (not a mine plant), it does not require internal mine manager approval
      if (!isMine && (st === 'draft' || st === 'submit' || st === 'submitted' || st === 'pending_approval')) {
        st = 'sent';
      }
      return { ...p, status: st, isMinePlant: isMine };
    });
    const directPoRefs = new Set(directPos.map((p) => p.reference || p.id));
    const mergedB2bPos = b2bPoRows.filter((p) => !directPoRefs.has(p.reference));
    const rows = live
      ? [...directPos, ...mergedB2bPos].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      : [];

    const stat = {
      draft: 'badge-neutral',
      submit: 'badge-warning',
      submitted: 'badge-warning',
      pending_approval: 'badge-warning',
      approved: 'badge-info',
      sent: 'badge-info',
      received: 'badge-success',
      rejected: 'badge-danger',
      cancelled: 'badge-neutral',
    };
    const label = {
      draft: 'Draft',
      submit: 'Awaiting Mine Approval',
      submitted: 'Awaiting Mine Approval',
      pending_approval: 'Awaiting Mine Approval',
      approved: 'Approved (Ready to Receive)',
      sent: 'Awaiting Receipt',
      received: 'Stock Received',
      rejected: 'Rejected',
      cancelled: 'Cancelled',
    };
    const canCreate = live && suppliers.length > 0 && products.length > 0;
    const busy = (po) => poBusyId === po.id;
    return (
      <Wrap>
        <Head icon={ClipboardList} title="Purchase Orders" sub="Inbound POs from mine plants (internal approval) & external vendors (receipt trigger). Receiving adds the stock to inventory."
          action={<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span className={`badge ${live ? 'badge-success' : 'badge-neutral'}`}>{live ? 'Live' : 'Demo data'}</span><button className="btn btn-primary" onClick={() => setShowPoModal(true)} disabled={!canCreate}><Plus size={16} /> New PO</button></div>} />
        <InlineError error={dataErr.po} onRetry={reloadPo} title="Purchase orders didn’t load" />
        {live && !canCreate && <div className="card"><div className="card-bd muted" style={{ padding: 18 }}>Add at least one supplier and one product before raising a purchase order.</div></div>}
        {live && <ReplenishmentPanel products={productsWithCost} suppliers={suppliers} scope={commerceScope} triggerNotification={triggerNotification} onGenerated={reloadPo} canCreate={canCreate} live={live} />}
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Reference / Source</th><th>Supplier / Plant</th><th className="num">Lines</th><th className="num">Total</th><th className="center">Workflow Status</th><th className="center">Actions</th></tr></thead>
              <tbody>
                {!live && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 22 }}>Connect the live backend to manage purchase orders.</td></tr>}
                {live && rows.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 22 }}>No purchase orders yet — raise one with “New PO” or place a B2B order.</td></tr>}
                {rows.map((po) => (
                  <tr key={po.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{po.reference || '—'}</div>
                      <div className="eyebrow">{(po.createdAt || '').slice(0, 10)}{po.expectedDate ? ` · exp ${po.expectedDate}` : ''}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{po.supplier}</div>
                      <div className="eyebrow">{/mine|plant|shaft|kumba|kolomela|tenke|sishen|amandelbult|thabazimbi/i.test(po.supplier || '') ? 'Internal mine plant' : 'External safety vendor'}</div>
                    </td>
                    <td className="num">{po.lineCount}</td>
                    <td className="num tabular">{money(po.total, po.currency)}</td>
                    <td className="center">
                      <span className={`badge ${stat[po.status] || 'badge-neutral'}`}>{label[po.status] || po.status}</span>
                      {po.approvedBy && (po.status === 'approved' || po.status === 'sent' || po.status === 'received') && (
                        <div className="eyebrow" style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center' }}><PenLine size={10} /> {po.approvedBy}</div>
                      )}
                      {po.status === 'rejected' && po.rejectionReason && <div className="eyebrow" style={{ marginTop: 3, color: 'var(--danger)' }}>{po.rejectionReason}</div>}
                    </td>
                    <td className="center" style={{ whiteSpace: 'nowrap' }}>
                      {po.status === 'draft' && <button className="btn btn-secondary btn-sm" disabled={busy(po)} onClick={() => poAction(po, 'submit')}>{busy(po) ? <Loader2 size={13} className="spin" /> : <Send size={13} />} Submit for approval</button>}
                      {(po.status === 'pending_approval' || po.status === 'submitted' || po.status === 'submit') && (
                        <span className="muted" style={{ fontSize: 12, fontStyle: 'italic' }}>Awaiting manager sign-off in Approvals</span>
                      )}
                      {po.status === 'rejected' && <button className="btn btn-secondary btn-sm" disabled={busy(po)} onClick={() => poAction(po, 'submit')}>Re-submit</button>}
                      {(po.status === 'approved' || po.status === 'sent') && <>
                        <button className="btn btn-secondary btn-sm" title="Print / PDF" onClick={() => printPo(po)}><Printer size={13} /></button>
                        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} title="Email to supplier" disabled={busy(po)} onClick={() => emailPo(po)}><Mail size={13} /></button>
                        <button className="btn btn-primary btn-sm" style={{ marginLeft: 6 }} disabled={busy(po)} onClick={() => setPoReceive(po)}>{busy(po) ? <Loader2 size={13} className="spin" /> : <PackageCheck size={13} />} Receive stock</button>
                      </>}
                      {po.status === 'received' && <>
                        <button className="btn btn-secondary btn-sm" title="Print / PDF" onClick={() => printPo(po)}><Printer size={13} /></button>
                        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} title="Report a quality return" disabled={busy(po)} onClick={() => setPoQuality(po)}><RotateCcw size={13} /> Quality</button>
                      </>}
                      {po.status !== 'received' && <button className="icon-btn" style={{ width: 30, height: 30, marginLeft: 6 }} title="Delete" onClick={() => setPoDelete(po)}><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {showPoModal && <PurchaseOrderModal suppliers={suppliers} products={productsWithCost} scope={commerceScope} triggerNotification={triggerNotification} onClose={() => setShowPoModal(false)} onSaved={reloadPo} />}
        {poReceive && <ReceivePoModal po={poReceive} busy={busy(poReceive)} onClose={() => setPoReceive(null)} onConfirm={(receivedLines, damagedLines) => { poAction(poReceive, 'receive', { receivedLines, damagedLines }); setPoReceive(null); }} />}
        {poQuality && <QualityReturnModal po={poQuality} busy={busy(poQuality)} onClose={() => setPoQuality(null)} onConfirm={(returnedLines, note) => { poAction(poQuality, 'report_quality', { returnedLines, note }); setPoQuality(null); }} />}
        {poDelete && <ConfirmDialog title="Delete purchase order" message={`Delete the ${poDelete.supplier} purchase order? This cannot be undone.`} confirmLabel="Delete" onConfirm={() => doDeletePo(poDelete)} onClose={() => setPoDelete(null)} />}
      </Wrap>
    );
  }

  /* ---------------- Workflows (real saga canvas) ---------------- */
  if (view === 'workflows') {
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
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="badge badge-neutral">{engine.executionsTotal} execution{engine.executionsTotal === 1 ? '' : 's'} recorded</span>
                <button className="btn btn-primary btn-sm" disabled={runningWf} onClick={() => runWorkflow(false)}><Play size={13} /> {runningWf ? 'Running…' : 'Run saga'}</button>
                <button className="btn btn-secondary btn-sm" disabled={runningWf} onClick={() => runWorkflow(true)} title="Trigger a downstream failure to watch the saga compensate"><RotateCw size={13} /> Run + fail</button>
              </div>
            </div>
            {lastRun && (
              <div className="card-bd" style={{ borderBottom: '1px solid var(--border)', background: lastRun.state === 'done' ? 'var(--success-weak)' : 'var(--danger-weak)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
                  <span className={`badge ${lastRun.state === 'done' ? 'badge-success' : 'badge-danger'}`}>{lastRun.state}</span>
                  <span>Executed <strong>{lastRun.workflowId}</strong> live · txn <code style={{ fontSize: 12 }}>{String(lastRun.transactionId || '—').slice(0, 18)}</code></span>
                  {lastRun.errors?.length > 0 && <span className="muted" style={{ fontSize: 12 }}>· compensated: {lastRun.errors[0]}</span>}
                </div>
              </div>
            )}
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

        <div className="card">
          <div className="card-hd">
            <div>
              <h3>{REAL_SAGA.name}</h3>
              <div className="card-sub">{REAL_SAGA.nodes.length} steps · {REAL_SAGA.compensates ? 'rolls back on failure' : 'no compensation'} · <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>{REAL_SAGA.id}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="badge badge-success">real saga</span>
              <span className="badge badge-neutral">store: true · durable</span>
            </div>
          </div>
          <div className="card-bd">
            <div style={{ overflowX: 'auto', paddingBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 'max-content', padding: '6px 2px' }}>
                {REAL_SAGA.nodes.map((n, i) => (
                  <React.Fragment key={i}>
                    <WfNode node={n} />
                    {i < REAL_SAGA.nodes.length - 1 && <Connector />}
                  </React.Fragment>
                ))}
              </div>
            </div>
            {REAL_SAGA.compensates && (
              <div className="card" style={{ boxShadow: 'none', background: 'var(--danger-weak)', borderColor: 'var(--primary-weak-bd)', marginTop: 14 }}>
                <div className="card-bd" style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RotateCw size={15} style={{ color: 'var(--danger)' }} />
                  <span style={{ fontSize: 13 }}>On failure the saga <strong>compensates in reverse</strong> — release the reservation, then void the audit entry — so state never ends up half-applied. ({REAL_SAGA.note})</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Run the real saga on a chosen SKU + quantity (B) */}
        <div className="card">
          <div className="card-hd"><h3>Run the saga</h3><span className="badge badge-neutral">live · commerce.manage (MFA)</span></div>
          <div className="card-bd" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '2 1 220px', margin: 0 }}>
              <label className="field-label">SKU {products.length ? `(catalogue has ${products.length})` : ''}</label>
              <input className="input" placeholder={products[0]?.sku ?? 'DROMEX-BOOT'} value={runSku} onChange={(e) => setRunSku(e.target.value)} />
            </div>
            <div className="field" style={{ flex: '1 1 110px', margin: 0 }}>
              <label className="field-label">Quantity</label>
              <input className="input" type="number" min={1} value={runQty} onChange={(e) => setRunQty(e.target.value)} />
            </div>
            <button className="btn btn-primary" disabled={runningWf} onClick={() => runWorkflow(false)}><Play size={13} /> {runningWf ? 'Running…' : 'Run saga'}</button>
            <button className="btn btn-secondary" disabled={runningWf} onClick={() => runWorkflow(true)} title="Trigger a downstream failure at the audit step to watch the saga compensate"><RotateCw size={13} /> Run + fail</button>
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
