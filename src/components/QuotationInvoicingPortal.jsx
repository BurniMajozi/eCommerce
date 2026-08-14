import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { InvoiceModal } from './InvoiceModal';
import { ProductThumb } from './ProductThumb';
import { Receipt, Plus, FileText, ArrowRight, Store, TrendingUp } from 'lucide-react';

export const QuotationInvoicingPortal = () => {
  const { products, quotations, saveQuotation, convertQuoteToInvoice, selectedInvoice, setSelectedInvoice, taxEnabled, setTaxEnabled } = useApp();
  const stockFor = (sku) => products.find(p => p.sku === sku)?.stockOnHand ?? 0;

  const [clientName, setClientName] = useState('Rand Colliery');
  const [vatNumber, setVatNumber] = useState('ZA4920194821');
  const [poNumber, setPoNumber] = useState('PO-88213');
  // Seed a couple of demo lines from whatever products exist. Guards against an
  // empty/short catalogue (live mode before products are seeded) so the page
  // never crashes on products[13]/[22].
  const seedLine = (idx, qty) => {
    const p = products[idx];
    return p ? { sku: p.sku, name: p.name, qty, unitCost: p.costPrice ?? 0, unitPrice: p.sellingPrice ?? 0 } : null;
  };
  const [items, setItems] = useState(() => [seedLine(13, 20), seedLine(22, 30)].filter(Boolean));

  const addItem = (sku) => {
    const p = products.find(x => x.sku === sku);
    if (!p || items.some(i => i.sku === sku)) return;
    setItems(prev => [...prev, { sku: p.sku, name: p.name, qty: 1, unitCost: p.costPrice ?? 0, unitPrice: p.sellingPrice ?? 0 }]);
  };
  const setQty = (sku, q) => setItems(prev => prev.map(i => i.sku === sku ? { ...i, qty: Math.max(1, parseInt(q) || 1) } : i));

  const subtotal = items.reduce((a, i) => a + i.unitPrice * i.qty, 0);
  const costTotal = items.reduce((a, i) => a + i.unitCost * i.qty, 0);
  const profit = subtotal - costTotal;
  const marginPct = subtotal ? (profit / subtotal) * 100 : 0;
  const vat = taxEnabled ? subtotal * 0.15 : 0;

  const createQuote = (e) => {
    e.preventDefault();
    if (!items.length) return;
    saveQuotation({ id: `QT-2026-${Math.floor(100 + Math.random() * 900)}`, clientName, vatNumber, poNumber, date: '2026-08-11', validDays: 30, status: 'DRAFT', marginPercent: Math.round(marginPct), taxEnabled, items });
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 24 }}>
      <div className="page-head">
        <div>
          <h2>B2B sales &amp; invoicing</h2>
          <p>Customer storefront on contract pricing → quote → VAT tax invoice. Multi-currency ready for cross-border customers.</p>
        </div>
        <span className="badge badge-primary"><Receipt size={13} /> External sale</span>
      </div>

      <div className="cols" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
        {/* Storefront / quote builder */}
        <div className="card">
          <div className="card-hd">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Store size={17} style={{ color: 'var(--primary)' }} /><h3>Customer storefront</h3></div>
            <span className="badge badge-neutral">Contract price list B</span>
          </div>
          <form className="card-bd" onSubmit={createQuote} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="cols cols-2">
              <div className="field"><label className="field-label">Client</label><input className="input" value={clientName} onChange={e => setClientName(e.target.value)} required /></div>
              <div className="field"><label className="field-label">VAT number</label><input className="input" value={vatNumber} onChange={e => setVatNumber(e.target.value)} required /></div>
            </div>
            <div className="field"><label className="field-label">PO number</label><input className="input" value={poNumber} onChange={e => setPoNumber(e.target.value)} /></div>

            <div className="field">
              <label className="field-label">Add from catalogue</label>
              <select className="select" value="" onChange={e => { if (e.target.value) addItem(e.target.value); }}>
                <option value="">Select a product (contract price)…</option>
                {products.map(p => <option key={p.sku} value={p.sku}>{p.sku} · {p.name}{p.sellingPrice != null ? ` (R${p.sellingPrice.toFixed(2)})` : ''}</option>)}
              </select>
            </div>

            <div className="table-wrap card" style={{ boxShadow: 'none' }}>
              <table className="table">
                <thead><tr><th>Item</th><th className="center">Stock</th><th className="center">Qty</th><th className="num">Line total</th></tr></thead>
                <tbody>
                  {items.map(i => {
                    const stock = stockFor(i.sku); const short = i.qty > stock;
                    return (
                      <tr key={i.sku}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <ProductThumb sku={i.sku} name={i.name} size={34} style={{ width: 34, flex: '0 0 auto' }} />
                            <div><div style={{ fontWeight: 500 }}>{i.name}</div><div className="eyebrow">{i.sku}</div></div>
                          </div>
                        </td>
                        <td className="center"><span className={`badge ${short ? 'badge-danger' : 'badge-success'}`}>{stock}{short ? ' short' : ''}</span></td>
                        <td className="center"><input type="number" min="1" className="input" style={{ width: 64, textAlign: 'center', padding: '5px 6px' }} value={i.qty} onChange={e => setQty(i.sku, e.target.value)} /></td>
                        <td className="num" style={{ fontWeight: 600 }}>R {(i.unitPrice * i.qty).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Profitability — merchant view */}
            <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
              <div className="card-bd" style={{ padding: 14, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><TrendingUp size={16} style={{ color: 'var(--success)' }} /><span className="eyebrow">Profitability</span></div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginLeft: 'auto' }}>
                  <div><div className="eyebrow">Cost</div><div className="tabular" style={{ fontWeight: 600 }}>R {costTotal.toFixed(2)}</div></div>
                  <div><div className="eyebrow">Profit</div><div className="tabular" style={{ fontWeight: 600, color: 'var(--success)' }}>R {profit.toFixed(2)}</div></div>
                  <div><div className="eyebrow">Margin</div><div><span className={`badge ${marginPct >= 30 ? 'badge-success' : marginPct >= 18 ? 'badge-warning' : 'badge-danger'}`}>{marginPct.toFixed(1)}%</span></div></div>
                </div>
              </div>
            </div>

            <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
              <div className="card-bd" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}><span className="muted">Subtotal excl VAT</span><span className="tabular">R {subtotal.toFixed(2)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13.5 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={taxEnabled} onChange={e => setTaxEnabled(e.target.checked)} />
                    <span className="muted">Add VAT 15%</span>
                  </label>
                  <span className="tabular muted">R {vat.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 2 }}><span>Total {taxEnabled ? 'incl VAT' : '(no VAT)'}</span><span className="tabular">R {(subtotal + vat).toFixed(2)}</span></div>
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-block"><Plus size={16} /> Request quote / place order</button>
          </form>
        </div>

        {/* Saved quotes */}
        <div className="card" style={{ alignSelf: 'flex-start' }}>
          <div className="card-hd"><h3>Quotes → invoice</h3><span className="badge badge-neutral">{quotations.length} saved</span></div>
          <div className="card-bd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {quotations.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No quotations yet — build one on the left.</div>}
            {quotations.map(q => {
              const sub = q.items.reduce((a, i) => a + i.unitPrice * i.qty, 0);
              const qTotal = q.taxEnabled === false ? sub : sub * 1.15;
              const converted = q.status === 'CONVERTED_TO_INVOICE';
              return (
                <div key={q.id} className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
                  <div className="card-bd" style={{ padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span className="eyebrow">{q.id}</span>
                        <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>{q.clientName}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{q.date} · PO {q.poNumber}</div>
                      </div>
                      <span className={`badge ${converted ? 'badge-success' : 'badge-warning'}`}>{converted ? 'invoiced' : 'draft'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10 }}>
                      <span className="muted" style={{ fontSize: 12.5 }}>Total {q.taxEnabled === false ? '(no VAT)' : 'incl VAT'}</span>
                      <span style={{ fontWeight: 600 }} className="tabular">R {qTotal.toFixed(2)}</span>
                    </div>
                    <button className="btn btn-secondary btn-sm btn-block" style={{ marginTop: 10 }} onClick={() => convertQuoteToInvoice(q.id)}>
                      <FileText size={15} /> Issue tax invoice <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selectedInvoice && <InvoiceModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />}
    </div>
  );
};
