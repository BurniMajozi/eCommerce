import React, { useState, useMemo } from 'react';
import { createPurchaseOrder } from '../catalogue/catalogueClient';
import { AlertTriangle, PackagePlus, Loader2, RefreshCcw, Sliders, ShieldCheck } from 'lucide-react';

// "5–7 days" / "5 days" / 6 → a single number of days.
const parseLead = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v).match(/\d+(\.\d+)?/g);
  if (!m) return null;
  const nums = m.map(Number);
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
};
const rand = (n, cur = 'ZAR') => `${cur === 'ZAR' ? 'R' : cur + ' '}${Number(n || 0).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;

// Replenishment engine.
//   forward cover (days) = (on hand + in transit) ÷ daily consumption
//   reorder-at          = lead time + safety buffer
//   → when forward cover ≤ reorder-at, the SKU must be reordered NOW so it does
//     not run dry during the supplier's lead time.
//   suggested qty        = ceil(daily × (lead time + target cover)) − (on hand + in transit)
//     i.e. top the position back up to "lead + target cover" days of stock.
// Suggestions are grouped per supplier and can be raised as DRAFT POs for the
// merchant/buyer to review and approve (nothing is auto-sent).
export const ReplenishmentPanel = ({ products = [], suppliers = [], scope, triggerNotification, onGenerated, canCreate = true, live = true }) => {
  const [safetyDays, setSafetyDays] = useState(7);
  const [targetCoverDays, setTargetCoverDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [tune, setTune] = useState(false);

  const supplierById = useMemo(() => { const m = new Map(); for (const s of suppliers) m.set(s.id, s); return m; }, [suppliers]);

  const suggestions = useMemo(() => {
    const out = [];
    for (const p of products) {
      const daily = Number(p.dailyConsumption || 0);
      if (daily <= 0) continue; // no consumption signal → cover is undefined
      const onHand = Number(p.stockOnHand || 0);
      const inTransit = Number(p.stockInTransit || 0);
      const available = onHand + inTransit;
      const supplier = p.supplierId ? supplierById.get(p.supplierId) : null;
      const lead = parseLead(p.leadTimeDays) ?? parseLead(supplier?.leadTime) ?? 7;
      const coverDays = available / daily;
      const reorderAtDays = lead + safetyDays;
      if (coverDays > reorderAtDays) continue; // still has enough forward cover
      const orderUpTo = Math.ceil(daily * (lead + targetCoverDays));
      const suggestedQty = Math.max(0, orderUpTo - available);
      if (suggestedQty <= 0) continue;
      out.push({
        productId: p.id, sku: p.sku, name: p.name,
        onHand, inTransit, daily, coverDays, lead, reorderAtDays,
        suggestedQty, unitCost: p.costPrice ?? null,
        supplierId: p.supplierId || null, supplierName: supplier?.company || p.supplier || null,
        currency: supplier?.currency || 'ZAR',
        critical: coverDays <= lead, // will run dry before stock even arrives
      });
    }
    return out.sort((a, b) => a.coverDays - b.coverDays);
  }, [products, supplierById, safetyDays, targetCoverDays]);

  const groups = useMemo(() => {
    const m = new Map();
    for (const s of suggestions) {
      if (!s.supplierId) continue; // can't raise a PO without a linked supplier
      if (!m.has(s.supplierId)) m.set(s.supplierId, { supplierId: s.supplierId, supplierName: s.supplierName, currency: s.currency, lines: [] });
      m.get(s.supplierId).lines.push(s);
    }
    return [...m.values()];
  }, [suggestions]);
  const unassigned = suggestions.filter((s) => !s.supplierId);
  const missingCost = suggestions.some((s) => s.unitCost == null);

  const generate = async () => {
    if (!groups.length) return;
    setBusy(true);
    let created = 0;
    try {
      for (const g of groups) {
        const lines = g.lines.map((l) => ({ productId: l.productId, sku: l.sku, name: l.name, qty: l.suggestedQty, unitCost: l.unitCost ?? 0 }));
        await createPurchaseOrder({ draft: true, supplierId: g.supplierId, supplierName: g.supplierName, currency: g.currency, reference: `Auto-replenishment ${new Date().toISOString().slice(0, 10)}`, lines }, scope);
        created += 1;
      }
      triggerNotification('Draft POs raised', `${created} draft purchase order${created === 1 ? '' : 's'} created from replenishment — review & approve them below.`, 'success');
      onGenerated?.();
    } catch (e) {
      triggerNotification('Replenishment failed', e?.message || 'Could not raise the draft purchase orders.', 'danger');
    } finally { setBusy(false); }
  };

  const critCount = suggestions.filter((s) => s.critical).length;

  return (
    <div className="card">
      <div className="card-hd" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RefreshCcw size={17} style={{ color: 'var(--primary)' }} />
          <h3>Replenishment</h3>
          {suggestions.length > 0
            ? <span className={`badge ${critCount ? 'badge-danger' : 'badge-warning'}`}>{suggestions.length} to reorder{critCount ? ` · ${critCount} critical` : ''}</span>
            : <span className="badge badge-success">All above reorder point</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setTune((t) => !t)}><Sliders size={14} /> Tune</button>
          {suggestions.length > 0 && live && canCreate && (
            <button className="btn btn-primary btn-sm" onClick={generate} disabled={busy || !groups.length}>
              {busy ? <><Loader2 size={14} className="spin" /> Raising…</> : <><PackagePlus size={14} /> Generate {groups.length} draft PO{groups.length === 1 ? '' : 's'}</>}
            </button>
          )}
        </div>
      </div>

      {tune && (
        <div className="card-bd" style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0, width: 160 }}>
            <label className="field-label" style={{ marginBottom: 4 }}>Safety buffer (days)</label>
            <input type="number" min="0" className="input" value={safetyDays} onChange={(e) => setSafetyDays(Math.max(0, parseInt(e.target.value) || 0))} />
          </div>
          <div className="field" style={{ margin: 0, width: 160 }}>
            <label className="field-label" style={{ marginBottom: 4 }}>Target cover (days)</label>
            <input type="number" min="1" className="input" value={targetCoverDays} onChange={(e) => setTargetCoverDays(Math.max(1, parseInt(e.target.value) || 1))} />
          </div>
          <p className="muted" style={{ fontSize: 12, margin: 0, flex: '1 1 220px' }}>
            Reorder when forward cover ≤ <strong>lead time + {safetyDays}d</strong>. Order enough to reach <strong>lead time + {targetCoverDays}d</strong> of cover.
          </p>
        </div>
      )}

      {suggestions.length === 0 ? (
        <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>
          Every SKU with a consumption signal is above its reorder point (forward cover &gt; lead time + {safetyDays} days). Nothing to reorder right now.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr>
              <th>SKU</th><th>Product</th>
              <th className="num" title="On hand + in transit">Available</th>
              <th className="num" title="Average daily consumption">Daily use</th>
              <th className="center" title="Forward cover in days = available ÷ daily use">Cover</th>
              <th className="num" title="Supplier lead time (days)">Lead</th>
              <th className="num" title="Suggested order quantity">Order qty</th>
              <th className="num">Unit cost</th>
              <th className="num">Line</th>
              <th>Supplier</th>
            </tr></thead>
            <tbody>
              {suggestions.map((s) => (
                <tr key={s.sku} style={s.critical ? { background: 'var(--danger-weak)' } : undefined}>
                  <td className="muted">{s.sku}</td>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td className="num tabular">{s.onHand}{s.inTransit ? <span className="muted"> +{s.inTransit}</span> : ''}</td>
                  <td className="num tabular">{s.daily.toLocaleString('en-ZA', { maximumFractionDigits: 1 })}</td>
                  <td className="center">
                    <span className={`badge ${s.critical ? 'badge-danger' : 'badge-warning'}`}>{Math.round(s.coverDays)}d</span>
                    {s.critical && <div className="eyebrow" style={{ color: 'var(--danger)' }}>&lt; lead time</div>}
                  </td>
                  <td className="num tabular">{s.lead}d</td>
                  <td className="num tabular" style={{ fontWeight: 700 }}>{s.suggestedQty.toLocaleString('en-ZA')}</td>
                  <td className="num tabular">{s.unitCost == null ? <span className="muted" title="Cost unavailable — verify with authenticator on Products &amp; Pricing">—</span> : rand(s.unitCost, s.currency)}</td>
                  <td className="num tabular" style={{ fontWeight: 600 }}>{s.unitCost == null ? '—' : rand(s.suggestedQty * s.unitCost, s.currency)}</td>
                  <td>{s.supplierName || <span className="badge badge-warning" title="Link this SKU to a supplier to auto-raise a PO">unlinked</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="card-bd" style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>
              Forward cover = (on hand + in transit) ÷ daily use. A SKU is due when cover ≤ lead time + {safetyDays}d; the order tops it up to lead time + {targetCoverDays}d. Generating raises one <strong>draft</strong> PO per supplier — nothing is sent until it is reviewed &amp; approved.
            </p>
            {unassigned.length > 0 && (
              <p style={{ fontSize: 12, margin: 0, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={13} /> {unassigned.length} SKU(s) need reordering but have no linked supplier — set a supplier on the product to include them in a draft PO.
              </p>
            )}
            {missingCost && (
              <p style={{ fontSize: 12, margin: 0, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck size={13} /> Some costs show “—” because cost data is protected — verify with your authenticator on Products &amp; Pricing so drafts carry the linked cost.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
