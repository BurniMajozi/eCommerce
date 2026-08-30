import React, { useMemo, useState } from 'react';
import { createPromotion } from '../catalogue/catalogueClient';
import { BadgePercent, X, Loader2, Send, Search } from 'lucide-react';

const TYPES = [
  { key: 'markdown', label: 'Markdown', hint: 'Straight percentage off the cost basis' },
  { key: 'new', label: 'New line', hint: 'Introductory push for a new product' },
  { key: 'upgrade', label: 'Upgrade', hint: 'Upsell / upgrade incentive' },
  { key: 'focus', label: 'Focus', hint: 'Featured stock to clear' },
];

// Merchant creates a product promotion: pick a product (cost + price auto-pull
// from the catalogue), choose a type and a discount %, then send it to managers.
// The promo activates immediately and is reflected on the stock/price tables.
export const PromotionFormModal = ({ products, onClose, onCreated, scope }) => {
  const [productId, setProductId] = useState('');
  const [search, setSearch] = useState('');
  const [promoType, setPromoType] = useState('markdown');
  const [discountPct, setDiscountPct] = useState(10);
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products.filter((p) => p.sku && p.name);
    if (!q) return list.slice(0, 40);
    return list.filter((p) => `${p.sku} ${p.name}`.toLowerCase().includes(q)).slice(0, 40);
  }, [products, search]);

  // Match on the same key used for the <option> value (id, falling back to sku),
  // so selection works even for catalogue rows that don't carry a Medusa id.
  const selected = products.find((p) => (p.id || p.sku) === productId) || null;
  const cost = Number(selected?.costPrice ?? 0);
  const price = Number(selected?.sellingPrice ?? 0);
  const pct = Math.min(100, Math.max(0, Number(discountPct) || 0));
  const newCost = cost * (1 - pct / 100);
  const baseMargin = price > 0 ? ((price - cost) / price) * 100 : 0;
  const promoMargin = price > 0 ? ((price - newCost) / price) * 100 : 0;

  const submit = async () => {
    if (!selected) { setError('Select a product first.'); return; }
    if (pct <= 0) { setError('Enter a discount greater than 0%.'); return; }
    setBusy(true); setError(null);
    try {
      await createPromotion({
        productId: selected.id || null,
        sku: selected.sku,
        promoType,
        discountPct: pct,
        endDate: endDate || null,
      }, scope);
      onCreated();
    } catch (e) {
      setError(e?.message || 'Could not create the promotion.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BadgePercent size={18} style={{ color: 'var(--primary)' }} /><h3>New promotion</h3></div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label className="field-label">Product</label>
            <div style={{ position: 'relative' }}>
              <input className="input" placeholder="Search by SKU or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <Search size={14} style={{ position: 'absolute', right: 10, top: 11, color: 'var(--text-muted)' }} />
            </div>
            <select className="select" style={{ marginTop: 8 }} value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">{search ? 'Matching products…' : 'Select a product'}</option>
              {filtered.map((p, idx) => {
                const val = p.id || p.sku;
                return (
                  <option key={val || idx} value={val}>{p.sku} · {p.name}{p.sellingPrice != null ? ` (R${Number(p.sellingPrice).toFixed(2)})` : ''}</option>
                );
              })}
            </select>
          </div>

          {selected && (
            <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
              <div className="card-bd" style={{ padding: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div><div className="eyebrow">Cost</div><div className="tabular" style={{ fontWeight: 600 }}>R {cost.toFixed(2)}</div></div>
                <div><div className="eyebrow">Price</div><div className="tabular" style={{ fontWeight: 600 }}>R {price.toFixed(2)}</div></div>
                <div><div className="eyebrow">Margin</div><div className="tabular" style={{ fontWeight: 600 }}>{baseMargin.toFixed(1)}%</div></div>
              </div>
            </div>
          )}

          <div className="field">
            <label className="field-label">Promotion type</label>
            <div className="cols cols-2" style={{ gap: 8 }}>
              {TYPES.map((t) => (
                <button type="button" key={t.key}
                  className={`btn ${promoType === t.key ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ justifyContent: 'flex-start', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '8px 10px' }}
                  onClick={() => setPromoType(t.key)}>
                  <span style={{ fontWeight: 600 }}>{t.label}</span>
                  <span style={{ fontSize: 10.5, opacity: 0.8 }}>{t.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 160px', margin: 0 }}>
              <label className="field-label">Discount %</label>
              <input className="input" type="number" min="1" max="100" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
            </div>
            <div className="field" style={{ flex: '1 1 160px', margin: 0 }}>
              <label className="field-label">End date <span className="muted">(optional)</span></label>
              <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          {selected && pct > 0 && (
            <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
              <div className="card-bd" style={{ padding: 12, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div><div className="eyebrow">New cost basis</div><div className="tabular" style={{ fontWeight: 600, color: 'var(--danger)' }}>R {newCost.toFixed(2)}</div></div>
                <div><div className="eyebrow">New margin</div><div className="tabular" style={{ fontWeight: 600 }}>{promoMargin.toFixed(1)}%</div></div>
                <div className="muted" style={{ fontSize: 12 }}>margin narrows by {(baseMargin - promoMargin).toFixed(1)} pts</div>
              </div>
            </div>
          )}

          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        </div>
        <div className="modal-ft" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !selected}>
            {busy ? <><Loader2 size={15} className="spin" /> Sending…</> : <><Send size={15} /> Send to manager</>}
          </button>
        </div>
      </div>
    </div>
  );
};
