import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { getVariantOptions } from '../data/mockData';
import {
  Search, ShieldCheck, PackageCheck, Clock, QrCode, X, Camera, AlertTriangle,
  CheckCircle2, ChevronRight, Boxes
} from 'lucide-react';

const CATEGORIES = ['ALL', 'Arc Flash Protection', 'Footwear', 'Workwear', 'Hand Protection', 'Respiratory Protection', 'Eye Protection'];
const REASONS = ['Damaged on shift', 'Lost', 'Wrong size issued', 'Worn out / expired', 'Standard scheduled issue', 'Emergency'];
const MANAGER_REASONS = ['Visitor stock'];

const statusBadge = (s) => {
  if (s === 'APPROVED') return 'badge-success';
  if (s === 'REJECTED') return 'badge-danger';
  if (s === 'FULFILLED_DISPATCHED') return 'badge-info';
  return 'badge-warning';
};

export const EmployeePortal = () => {
  const { products, activeEmployee, requests, createRequest } = useApp();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [modalProduct, setModalProduct] = useState(null);
  const [reason, setReason] = useState('Damaged on shift');
  const [isEarly, setIsEarly] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [pass, setPass] = useState(null);
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const modalOpts = modalProduct ? getVariantOptions(modalProduct) : { sizes: [], colors: [] };

  const filtered = products.filter(p => {
    const s = search.toLowerCase();
    const hit = p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s);
    return hit && (category === 'ALL' || p.category === category);
  });
  const myRequests = requests.filter(r => r.employeeId === activeEmployee.id);
  const isManager = /manager|supervisor|foreman/i.test(activeEmployee.role || '');
  const reasons = isManager ? [...REASONS, ...MANAGER_REASONS] : REASONS;

  const openReq = (p) => {
    const opt = getVariantOptions(p);
    setModalProduct(p); setReason('Damaged on shift'); setIsEarly(false); setPhoto(false);
    setSize(opt.sizes[0]); setColor(opt.colors[0]);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!modalProduct) return;
    if (isEarly && !photo) { alert('Add a photo of the damaged item before submitting an early replacement.'); return; }
    const variantLabel = `${size}${color && color !== '—' ? ` · ${color}` : ''}`;
    const colorTag = color && color !== '—' ? `-${color.split(' ')[0].slice(0, 3).toUpperCase()}` : '';
    const req = createRequest({
      ...modalProduct,
      name: `${modalProduct.name} (${variantLabel})`,
      sku: `${modalProduct.sku}-${size}${colorTag}`,
      reason, isEarlyReplacement: isEarly,
      photoProofUrl: photo ? 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=80' : null
    });
    setModalProduct(null);
    setPass(req);
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 24 }}>
      <div className="page-head">
        <div>
          <h2>Request PPE</h2>
          <p>Browse your approved catalogue and raise a request. Early replacements need a photo and a manager co-sign.</p>
        </div>
        <div className="badge badge-success"><ShieldCheck size={13} /> 100% compliant</div>
      </div>

      {/* Worker + entitlement + custody */}
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(260px, 1fr) minmax(320px, 2fr)' }} className="grid-collapse">
        <div className="card">
          <div className="card-bd" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <span className="avatar" style={{ width: 52, height: 52, fontSize: 18 }}>
              {activeEmployee.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
            </span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{activeEmployee.name}</div>
              <div className="muted" style={{ fontSize: 13 }}>{activeEmployee.role} · {activeEmployee.department}</div>
              <div className="eyebrow" style={{ marginTop: 4 }}>{activeEmployee.id} · {activeEmployee.plant}</div>
            </div>
          </div>
          <hr className="divider" />
          <div className="card-bd" style={{ paddingTop: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Your entitlement</div>
            {[{ k: 'Gloves', v: '2 of 4 left', c: 'badge-warning' }, { k: 'Safety boots', v: 'next: Nov', c: 'badge-neutral' }, { k: 'Ear plugs', v: 'unlimited', c: 'badge-success' }].map((r, i) => (
              <div key={r.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 14 }}>{r.k}</span>
                <span className={`badge ${r.c}`}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-hd">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PackageCheck size={17} style={{ color: 'var(--primary)' }} />
              <h3>Active custody — who has what</h3>
            </div>
            <span className="badge badge-neutral">{activeEmployee.custody.length} items held</span>
          </div>
          <div className="card-bd">
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
              {activeEmployee.custody.map((item, i) => {
                const needs = item.condition.includes('Needs');
                return (
                  <div key={i} className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
                    <div className="card-bd" style={{ padding: 13 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                        <span className="eyebrow">{item.sku}</span>
                        {needs && <span className="badge badge-warning" style={{ fontSize: 10 }}>replace soon</span>}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 14, marginTop: 5 }}>{item.name}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>Issued {item.issueDate} · {item.lifespanMonths}m life</div>
                      <div className="progress" style={{ marginTop: 9 }}>
                        <span className={needs ? 'warn' : 'ok'} style={{ width: needs ? '100%' : '70%' }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* My requests */}
      {myRequests.length > 0 && (
        <div className="card">
          <div className="card-hd">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={17} style={{ color: 'var(--primary)' }} /><h3>My requests &amp; pickup passes</h3></div>
          </div>
          <div className="card-bd">
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {myRequests.map(req => (
                <div key={req.id} className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
                  <div className="card-bd" style={{ padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="eyebrow">{req.id}</span>
                      <span className={`badge ${statusBadge(req.status)}`}>{req.status.replace(/_/g, ' ').toLowerCase()}</span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 15, marginTop: 6 }}>{req.itemName}</div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{req.reason} · {req.requestDate}</div>
                    {req.status === 'APPROVED' && (
                      <button className="btn btn-primary btn-sm btn-block" style={{ marginTop: 12 }} onClick={() => setPass(req)}>
                        <QrCode size={15} /> Show pickup pass
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Catalogue */}
      <div className="card">
        <div className="card-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Boxes size={17} style={{ color: 'var(--primary)' }} /><h3>Approved catalogue</h3></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, color: 'var(--text-subtle)' }} />
              <input className="input" placeholder="Search item or SKU" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32, width: 200 }} />
            </div>
            <select className="select" value={category} onChange={e => setCategory(e.target.value)} style={{ width: 'auto' }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="card-bd">
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
            {filtered.map(p => (
              <div key={p.sku} className="card" style={{ boxShadow: 'none', display: 'flex', flexDirection: 'column' }}>
                <div className="card-bd" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span className="eyebrow">{p.sku}</span>
                    <span className="badge badge-neutral" style={{ fontSize: 10 }}>Cat {p.abcClass}</span>
                  </div>
                  <div className="thumb" style={{ height: 66 }}><Boxes size={22} /></div>
                  <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.25 }}>{p.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{p.stockOnHand > 0 ? 'In stock' : 'On order'} · {p.lifespanMonths}m life</div>
                  <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <button className="btn btn-secondary btn-sm btn-block" onClick={() => openReq(p)}>Request <ChevronRight size={14} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Request modal */}
      {modalProduct && (
        <div className="overlay" onClick={() => setModalProduct(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <div>
                <h3>Request PPE</h3>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{modalProduct.sku} · {modalProduct.name}</div>
              </div>
              <button className="icon-btn" onClick={() => setModalProduct(null)}><X size={18} /></button>
            </div>
            <form onSubmit={submit} className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {(modalOpts.sizes.length > 1 || modalOpts.colors[0] !== '—') && (
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {modalOpts.sizes[0] !== 'One size' && (
                    <div className="field" style={{ flex: 1, minWidth: 130 }}>
                      <label className="field-label">Size</label>
                      <select className="select" value={size} onChange={e => setSize(e.target.value)}>
                        {modalOpts.sizes.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                  {modalOpts.colors[0] !== '—' && (
                    <div className="field" style={{ flex: 1, minWidth: 130 }}>
                      <label className="field-label">Colour</label>
                      <select className="select" value={color} onChange={e => setColor(e.target.value)}>
                        {modalOpts.colors.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="field-label">Reason</label>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                  {reasons.map(r => (
                    <button type="button" key={r} onClick={() => setReason(r)}
                      className={`btn btn-sm ${reason === r ? 'btn-primary' : 'btn-secondary'}`} style={{ justifyContent: 'flex-start' }}>
                      {r === 'Visitor stock' ? '★ ' : ''}{r}
                    </button>
                  ))}
                </div>
                {isManager && <div className="eyebrow" style={{ marginTop: 6 }}>★ Visitor stock is a manager-only reason</div>}
              </div>

              <label className={`card`} style={{ padding: 13, display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', boxShadow: 'none', borderColor: isEarly ? 'var(--primary)' : 'var(--border)' }}>
                <input type="checkbox" checked={isEarly} onChange={e => setIsEarly(e.target.checked)} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 500 }}>
                  <AlertTriangle size={15} style={{ color: 'var(--warning)' }} /> Early replacement — before scheduled lifespan
                </span>
              </label>

              {isEarly && (
                <div>
                  <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Anti-theft policy: attach a photo of the damaged item for the Section Manager co-sign.</div>
                  <button type="button" onClick={() => setPhoto(true)}
                    className="btn btn-block" style={{ borderStyle: 'dashed', borderWidth: 1, borderColor: photo ? 'var(--success)' : 'var(--border-strong)', color: photo ? 'var(--success)' : 'var(--text-muted)', background: 'transparent' }}>
                    {photo ? <><CheckCircle2 size={16} /> Photo attached — damaged_boot_sole.jpg</> : <><Camera size={16} /> Add photo of damaged item</>}
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setModalProduct(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Submit request</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pickup pass */}
      {pass && (
        <div className="overlay" onClick={() => setPass(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <h3>Pickup pass · {pass.id}</h3>
              <button className="icon-btn" onClick={() => setPass(null)}><X size={18} /></button>
            </div>
            <div className="modal-bd" style={{ textAlign: 'center' }}>
              <div className="thumb" style={{ width: 150, height: 150, margin: '0 auto', color: 'var(--text)' }}><QrCode size={92} /></div>
              <div className="badge badge-primary" style={{ marginTop: 12 }}>OTP {pass.otp}</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>Show this at the store counter · Store 2 open till 15:00</div>
              <button className="btn btn-secondary btn-block" style={{ marginTop: 16 }} onClick={() => setPass(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@media (max-width: 820px){ .grid-collapse{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
};
