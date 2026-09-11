import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { fetchPromotions, storeCheckout, storeVerify, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { getVariantOptions } from '../data/mockData';
import { ProductThumb } from './ProductThumb';
import {
  ShoppingCart, Search, Plus, Minus, Trash2, Store, Sparkles, X, Loader2,
  CheckCircle2, CreditCard, PackageCheck, Tag, MapPin
} from 'lucide-react';

const rand = (n) => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const LOW_STOCK = 6; // ≤ this many on hand shows a "low stock" warning to the buyer
const stockStatus = (p) => {
  const s = Number(p.stockOnHand ?? 0);
  if (s <= 0) return { label: 'Out of stock', cls: 'badge-danger', ok: false };
  if (s <= LOW_STOCK) return { label: `Low · ${s} left`, cls: 'badge-warning', ok: true };
  return { label: 'In stock', cls: 'badge-success', ok: true };
};
const variantKey = (sku, size, color) => `${sku}__${size || ''}__${color || ''}`;
// A product needs a chooser if it offers a real size or colour choice.
const hasVariantChoice = (p) => { const o = getVariantOptions(p); return o.sizes[0] !== 'One size' || o.colors[0] !== '—'; };

export const ContractorStorePortal = () => {
  const { products, activeEmployee, auth, tenantAccess, activePlant, triggerNotification } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;

  const [promos, setPromos] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [basket, setBasket] = useState({}); // variantKey -> { sku, size, color, qty }
  const [showBasket, setShowBasket] = useState(false);
  const [variantPick, setVariantPick] = useState(null); // product being configured before add
  const [buyer, setBuyer] = useState({
    name: activeEmployee?.name || '', email: '', phone: '', company: 'Independent Contractor',
  });
  const [submitting, setSubmitting] = useState(false);
  const [ticket, setTicket] = useState(null);      // paid order + pickup code
  const [verifying, setVerifying] = useState(false);

  // Live promotions → retail discount + hero feature.
  useEffect(() => {
    if (!live) { setPromos([]); return; }
    let active = true;
    fetchPromotions(scope).then((r) => { if (active) setPromos(Array.isArray(r?.promotions) ? r.promotions : []); }).catch(() => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, scope.accessToken, scope.tenantId]);

  // Return from Paystack: ?store_ref=... → verify and show the pickup ticket.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('store_ref');
    if (!ref || !live) return;
    setVerifying(true);
    storeVerify(ref, scope)
      .then((r) => {
        if (r.paid && r.order) { setTicket(r.order); setBasket({}); triggerNotification('Payment received', `Order ${r.order.reference} paid — collect with code ${r.order.pickupCode}.`, 'success'); }
        else if (r.needsPaymentSetup) triggerNotification('Awaiting payment setup', 'Order recorded; Paystack is not yet configured.', 'info');
        else triggerNotification('Payment pending', 'We could not confirm the payment yet.', 'warning');
      })
      .catch(() => {})
      .finally(() => { setVerifying(false); window.history.replaceState({}, '', window.location.pathname); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const promoPct = useMemo(() => {
    const m = new Map();
    (promos || []).forEach((p) => { if (p.status === 'active' && !p.expired && p.sku) m.set(p.sku, Number(p.discountPct) || 0); });
    return m;
  }, [promos]);

  const storePrice = (p) => {
    const base = Number(p.sellingPrice || 0);
    const pct = promoPct.get(p.sku) || 0;
    return { base, pct, net: pct ? base * (1 - pct / 100) : base };
  };

  const inStock = (products || []).filter((p) => (p.stockOnHand ?? 0) > 0);
  const featured = inStock.filter((p) => (promoPct.get(p.sku) || 0) > 0).slice(0, 4);
  const categories = useMemo(() => ['ALL', ...Array.from(new Set(inStock.map((p) => p.category).filter(Boolean)))], [inStock]);
  const filtered = inStock.filter((p) => {
    const s = search.trim().toLowerCase();
    const hit = !s || p.name.toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s);
    return hit && (category === 'ALL' || p.category === category);
  });

  const bySku = useMemo(() => { const m = new Map(); (products || []).forEach((p) => m.set(p.sku, p)); return m; }, [products]);
  const basketLines = Object.entries(basket).filter(([, v]) => v.qty > 0).map(([key, v]) => {
    const p = bySku.get(v.sku); if (!p) return null;
    const { base, pct, net } = storePrice(p);
    const variantLabel = [v.size, v.color].filter(Boolean).join(' · ');
    return { key, sku: v.sku, size: v.size ?? null, color: v.color ?? null, variantLabel, name: p.name, imageUrl: p.imageUrl, qty: v.qty, base, pct, net, lineTotal: net * v.qty };
  }).filter(Boolean);
  const subtotal = basketLines.reduce((a, l) => a + l.base * l.qty, 0);
  const total = basketLines.reduce((a, l) => a + l.lineTotal, 0);
  const discount = subtotal - total;
  const basketCount = basketLines.reduce((a, l) => a + l.qty, 0);
  const skuQtyInBasket = (sku) => basketLines.filter((l) => l.sku === sku).reduce((a, l) => a + l.qty, 0);

  // Add a specific variant (size/colour) to the basket.
  const addVariant = (p, size, color, n = 1) => {
    const s = size && size !== 'One size' ? size : null;
    const c = color && color !== '—' ? color : null;
    const key = variantKey(p.sku, s, c);
    setBasket((b) => ({ ...b, [key]: { sku: p.sku, size: s, color: c, qty: (b[key]?.qty || 0) + n } }));
  };
  // Open the size/colour chooser when a product has real variants, else add directly.
  const openAdd = (p) => {
    if (hasVariantChoice(p)) { const o = getVariantOptions(p); setVariantPick({ product: p, opts: o, size: o.sizes[0], color: o.colors[0], qty: 1 }); }
    else addVariant(p, null, null, 1);
  };
  const setQty = (key, q) => setBasket((b) => { const n = { ...b }; if (q <= 0) delete n[key]; else n[key] = { ...n[key], qty: q }; return n; });
  const remove = (key) => setBasket((b) => { const n = { ...b }; delete n[key]; return n; });

  const checkout = async () => {
    if (!basketLines.length) return;
    if (!/.+@.+\..+/.test(buyer.email.trim())) { triggerNotification('Email needed', 'Enter a valid email for the receipt.', 'warning'); return; }
    setSubmitting(true);
    try {
      const r = await storeCheckout({
        name: buyer.name, email: buyer.email.trim(), phone: buyer.phone, company: buyer.company,
        items: basketLines.map((l) => ({ sku: l.sku, qty: l.qty, size: l.size, color: l.color })),
      }, scope);
      if (r.authorizationUrl) { window.location.href = r.authorizationUrl; return; }
      if (r.needsPaymentSetup) {
        triggerNotification('Order recorded', `Reference ${r.reference}. Paystack isn’t configured yet — set PAYSTACK_SECRET_KEY to take payment.`, 'info');
      } else {
        triggerNotification('Checkout', 'Order created.', 'success');
      }
    } catch (err) {
      triggerNotification('Checkout failed', err.message || 'Could not start checkout.', 'danger');
    } finally { setSubmitting(false); }
  };

  // Paid — show the pickup ticket.
  if (ticket) {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 24, maxWidth: 560, margin: '0 auto' }}>
        <div className="card" style={{ borderColor: 'var(--success)' }}>
          <div className="card-bd" style={{ textAlign: 'center', padding: 28 }}>
            <CheckCircle2 size={44} style={{ color: 'var(--success)' }} />
            <h2 style={{ marginTop: 12, fontSize: 22 }}>Paid — collect at the store</h2>
            <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>Show this code at the {activePlant?.name || 'store'} counter to collect your PPE.</p>
            <div style={{ margin: '18px auto', padding: '14px 22px', display: 'inline-block', border: '2px dashed var(--primary)', borderRadius: 12, background: 'var(--primary-weak)' }}>
              <div className="eyebrow" style={{ color: 'var(--primary)' }}>Pickup code</div>
              <div className="mono" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '.06em', color: 'var(--primary)' }}>{ticket.pickupCode}</div>
            </div>
            <div className="muted" style={{ fontSize: 13 }}>Order {ticket.reference} · {rand(ticket.total)} · receipt sent to {ticket.buyerEmail}</div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Line</th></tr></thead>
              <tbody>
                {(ticket.lines || []).map((l, i) => (
                  <tr key={i}><td>{l.name}<div className="eyebrow">{l.sku}{[l.size, l.color].filter(Boolean).length ? ` · ${[l.size, l.color].filter(Boolean).join(' · ')}` : ''}</div></td><td className="num">{l.qty}</td><td className="num tabular">{rand(l.lineTotal)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <button className="btn btn-secondary btn-block" onClick={() => setTicket(null)}>Back to the store</button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 24 }}>
      <div className="page-head">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Store size={22} style={{ color: 'var(--primary)' }} /> Contractor Store</h2>
          <p>Buy PPE directly — pay securely with Paystack and collect at the store. On-promotion items are featured below.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowBasket(true)}>
          <ShoppingCart size={16} /> Basket{basketCount ? ` · ${basketCount}` : ''}
        </button>
      </div>

      {verifying && <div className="card"><div className="card-bd" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 16 }}><Loader2 size={16} className="spin" /> Confirming your payment…</div></div>}

      {/* Hero — promo items */}
      {featured.length > 0 && (
        <div className="card" style={{ background: 'linear-gradient(120deg, var(--primary-weak), var(--surface))', borderColor: 'var(--primary-weak-bd)' }}>
          <div className="card-hd" style={{ borderBottom: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Sparkles size={17} style={{ color: 'var(--primary)' }} /><h3>On promotion now</h3></div>
            <span className="badge badge-primary">Save while stock lasts</span>
          </div>
          <div className="card-bd" style={{ paddingTop: 0 }}>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {featured.map((p) => {
                const { base, pct, net } = storePrice(p);
                return (
                  <div key={p.sku} className="card" style={{ boxShadow: 'none', overflow: 'hidden', position: 'relative' }}>
                    <span className="badge badge-danger" style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, zIndex: 1 }}>−{pct}% SALE</span>
                    <div style={{ padding: 14, display: 'flex', justifyContent: 'center', background: 'var(--surface-2)' }}><ProductThumb sku={p.sku} name={p.name} imageUrl={p.imageUrl} size={96} /></div>
                    <div className="card-bd" style={{ padding: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, minHeight: 36, lineHeight: 1.3 }}>{p.name}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                        <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--primary)' }}>{rand(net)}</span>
                        <span className="muted" style={{ textDecoration: 'line-through', fontSize: 12 }}>{rand(base)}</span>
                      </div>
                      {(() => { const st = stockStatus(p); return <span className={`badge ${st.cls}`} style={{ fontSize: 10, marginTop: 6, alignSelf: 'flex-start' }}>{st.label}</span>; })()}
                      <button className="btn btn-primary btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => openAdd(p)}><Plus size={14} /> Add</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Catalogue */}
      <div className="card">
        <div className="card-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Tag size={17} style={{ color: 'var(--primary)' }} /><h3>Shop all PPE</h3></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, color: 'var(--text-subtle)' }} />
              <input className="input" placeholder="Search item or SKU" value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 32, width: 200 }} />
            </div>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 'auto' }}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="card-bd">
          {!live && <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Connect the live backend to buy from the store.</div>}
          <div className="cards-cv" style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
            {filtered.map((p) => {
              const { base, pct, net } = storePrice(p);
              const inBasket = skuQtyInBasket(p.sku);
              const st = stockStatus(p);
              return (
                <div key={p.sku} className="card" style={{ boxShadow: 'none', display: 'flex', flexDirection: 'column' }}>
                  <div className="card-bd" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span className="eyebrow">{p.category}</span>
                      {pct > 0 && <span className="badge badge-danger" style={{ fontSize: 10 }}>−{pct}%</span>}
                    </div>
                    <ProductThumb sku={p.sku} name={p.name} imageUrl={p.imageUrl} size={92} />
                    <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.25, minHeight: 36 }}>{p.name}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--primary)' }}>{rand(net)}</span>
                      {pct > 0 && <span className="muted" style={{ textDecoration: 'line-through', fontSize: 12 }}>{rand(base)}</span>}
                    </div>
                    <span className={`badge ${st.cls}`} style={{ fontSize: 10, alignSelf: 'flex-start' }}>{st.label}</span>
                    <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                      <button className="btn btn-secondary btn-sm btn-block" onClick={() => openAdd(p)}>
                        <Plus size={14} /> Add to basket{inBasket ? ` · ${inBasket} in basket` : ''}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Basket drawer */}
      {showBasket && (
        <div className="overlay" onClick={() => setShowBasket(false)}>
          <div className="modal" style={{ maxWidth: 460, maxHeight: 'min(88vh, 720px)', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><ShoppingCart size={18} style={{ color: 'var(--primary)' }} /><h3>Your basket</h3></div>
              <button className="icon-btn" onClick={() => setShowBasket(false)} aria-label="Close"><X size={17} /></button>
            </div>
            <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {basketLines.length === 0 ? (
                <div className="muted" style={{ textAlign: 'center', padding: 24 }}>Your basket is empty.</div>
              ) : (
                <>
                  {basketLines.map((l) => (
                    <div key={l.key} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <ProductThumb sku={l.sku} name={l.name} imageUrl={l.imageUrl} size={44} style={{ width: 44, flex: '0 0 auto' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div>
                        {l.variantLabel && <div style={{ fontSize: 11.5 }}><span className="badge badge-neutral" style={{ fontSize: 10 }}>{l.variantLabel}</span></div>}
                        <div className="muted" style={{ fontSize: 12 }}>{rand(l.net)}{l.pct > 0 && <span style={{ textDecoration: 'line-through', marginLeft: 6 }}>{rand(l.base)}</span>} each</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setQty(l.key, l.qty - 1)}><Minus size={13} /></button>
                        <span className="mono" style={{ minWidth: 18, textAlign: 'center' }}>{l.qty}</span>
                        <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setQty(l.key, l.qty + 1)}><Plus size={13} /></button>
                        <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => remove(l.key)} aria-label="Remove"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                  <hr className="divider" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span className="muted">Subtotal</span><span className="tabular">{rand(subtotal)}</span></div>
                  {discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--success)' }}><span>Promo discount</span><span className="tabular">−{rand(discount)}</span></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}><span>Total</span><span className="tabular" style={{ color: 'var(--primary)' }}>{rand(total)}</span></div>

                  <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
                    <div className="card-bd" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
                      <div className="eyebrow">Buyer details (for the receipt &amp; pickup)</div>
                      <input className="input" placeholder="Full name" value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} />
                      <input className="input" type="email" placeholder="Email *" value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input className="input" placeholder="Phone" value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} />
                        <input className="input" placeholder="Company" value={buyer.company} onChange={(e) => setBuyer({ ...buyer, company: e.target.value })} />
                      </div>
                    </div>
                  </div>
                  <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-subtle)' }}><MapPin size={12} /> Collect at {activePlant?.name || 'the store'} after payment</div>
                </>
              )}
            </div>
            <div className="modal-ft" style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setShowBasket(false)}>Keep shopping</button>
              <button className="btn btn-primary" onClick={checkout} disabled={submitting || !basketLines.length || !live}>
                {submitting ? <><Loader2 size={15} className="spin" /> Starting…</> : <><CreditCard size={15} /> Pay {rand(total)}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Size / colour chooser — shown before adding a product that has variants */}
      {variantPick && (() => {
        const p = variantPick.product; const o = variantPick.opts;
        const hasSizes = o.sizes[0] !== 'One size';
        const hasColors = o.colors[0] !== '—';
        const { net } = storePrice(p);
        return (
          <div className="overlay" onClick={() => setVariantPick(null)}>
            <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
              <div className="modal-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Choose options</h3>
                <button className="icon-btn" onClick={() => setVariantPick(null)} aria-label="Close"><X size={17} /></button>
              </div>
              <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 18px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <ProductThumb sku={p.sku} name={p.name} imageUrl={p.imageUrl} size={44} style={{ width: 44, flex: '0 0 auto' }} />
                  <div><div style={{ fontWeight: 600 }}>{p.name}</div><div className="muted" style={{ fontSize: 12 }}>{rand(net)} each · {stockStatus(p).label}</div></div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {hasSizes && (
                    <div className="field" style={{ flex: 1, minWidth: 120, margin: 0 }}>
                      <label className="field-label">Size</label>
                      <select className="select" value={variantPick.size} onChange={(e) => setVariantPick((v) => ({ ...v, size: e.target.value }))}>
                        {o.sizes.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                  {hasColors && (
                    <div className="field" style={{ flex: 1, minWidth: 120, margin: 0 }}>
                      <label className="field-label">Colour</label>
                      <select className="select" value={variantPick.color} onChange={(e) => setVariantPick((v) => ({ ...v, color: e.target.value }))}>
                        {o.colors.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="field" style={{ width: 88, margin: 0 }}>
                    <label className="field-label">Qty</label>
                    <input type="number" min="1" className="input" value={variantPick.qty} onChange={(e) => setVariantPick((v) => ({ ...v, qty: Math.max(1, parseInt(e.target.value) || 1) }))} />
                  </div>
                </div>
              </div>
              <div className="modal-ft" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-secondary" onClick={() => setVariantPick(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={() => { addVariant(p, variantPick.size, variantPick.color, variantPick.qty); setVariantPick(null); }}><Plus size={15} /> Add to basket</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
