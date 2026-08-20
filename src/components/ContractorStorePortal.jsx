import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { fetchPromotions, storeCheckout, storeVerify, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { ProductThumb } from './ProductThumb';
import {
  ShoppingCart, Search, Plus, Minus, Trash2, Store, Sparkles, X, Loader2,
  CheckCircle2, CreditCard, PackageCheck, Tag, MapPin
} from 'lucide-react';

const rand = (n) => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const ContractorStorePortal = () => {
  const { products, activeEmployee, auth, tenantAccess, activePlant, triggerNotification } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;

  const [promos, setPromos] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [basket, setBasket] = useState({}); // sku -> qty
  const [showBasket, setShowBasket] = useState(false);
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
  const basketLines = Object.entries(basket).filter(([, q]) => q > 0).map(([sku, qty]) => {
    const p = bySku.get(sku); if (!p) return null;
    const { base, pct, net } = storePrice(p);
    return { sku, name: p.name, imageUrl: p.imageUrl, qty, base, pct, net, lineTotal: net * qty };
  }).filter(Boolean);
  const subtotal = basketLines.reduce((a, l) => a + l.base * l.qty, 0);
  const total = basketLines.reduce((a, l) => a + l.lineTotal, 0);
  const discount = subtotal - total;
  const basketCount = basketLines.reduce((a, l) => a + l.qty, 0);

  const add = (sku) => setBasket((b) => ({ ...b, [sku]: (b[sku] || 0) + 1 }));
  const setQty = (sku, q) => setBasket((b) => ({ ...b, [sku]: Math.max(0, q) }));
  const remove = (sku) => setBasket((b) => { const n = { ...b }; delete n[sku]; return n; });

  const checkout = async () => {
    if (!basketLines.length) return;
    if (!/.+@.+\..+/.test(buyer.email.trim())) { triggerNotification('Email needed', 'Enter a valid email for the receipt.', 'warning'); return; }
    setSubmitting(true);
    try {
      const r = await storeCheckout({
        name: buyer.name, email: buyer.email.trim(), phone: buyer.phone, company: buyer.company,
        items: basketLines.map((l) => ({ sku: l.sku, qty: l.qty })),
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
                  <tr key={i}><td>{l.name}<div className="eyebrow">{l.sku}</div></td><td className="num">{l.qty}</td><td className="num tabular">{rand(l.lineTotal)}</td></tr>
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
                      <button className="btn btn-primary btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => add(p.sku)}><Plus size={14} /> Add</button>
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
              const qty = basket[p.sku] || 0;
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
                    <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                      {qty > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                          <button className="icon-btn" onClick={() => setQty(p.sku, qty - 1)} aria-label="Decrease"><Minus size={14} /></button>
                          <span className="mono" style={{ fontWeight: 700 }}>{qty}</span>
                          <button className="icon-btn" onClick={() => add(p.sku)} aria-label="Increase"><Plus size={14} /></button>
                        </div>
                      ) : (
                        <button className="btn btn-secondary btn-sm btn-block" onClick={() => add(p.sku)}><Plus size={14} /> Add to basket</button>
                      )}
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
                    <div key={l.sku} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <ProductThumb sku={l.sku} name={l.name} imageUrl={l.imageUrl} size={44} style={{ width: 44, flex: '0 0 auto' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{rand(l.net)}{l.pct > 0 && <span style={{ textDecoration: 'line-through', marginLeft: 6 }}>{rand(l.base)}</span>} each</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setQty(l.sku, l.qty - 1)}><Minus size={13} /></button>
                        <span className="mono" style={{ minWidth: 18, textAlign: 'center' }}>{l.qty}</span>
                        <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => add(l.sku)}><Plus size={13} /></button>
                        <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => remove(l.sku)} aria-label="Remove"><Trash2 size={13} /></button>
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
    </div>
  );
};
