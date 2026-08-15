import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { createProduct, updateProduct, uploadProductImage, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { catalogueImage } from '../data/catalogueImages';
import { X, UploadCloud, Loader2, Save } from 'lucide-react';

const ABC = ['A', 'B', 'C'];

// Tenant-admin form to add OR edit a product in the live catalogue: uploads the
// photo to storage, then writes to Medusa under the tenant's sales channel. On
// success it refreshes the live reads so the change shows everywhere. Pass
// `product` to edit an existing one; omit it to create. Demo mode has no server
// to write to, so the form explains that.
export const ProductFormModal = ({ onClose, product = null }) => {
  const { products, auth, tenantAccess, refreshCatalogue, triggerNotification } = useApp();
  const isEdit = Boolean(product);
  const scope = {
    accessToken: auth.session?.access_token,
    tenantId: tenantAccess.activeTenantId,
    siteId: tenantAccess.activeSiteId,
  };
  const live = isMedusaCatalogueEnabled && scope.accessToken && scope.tenantId;

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(),
    [products],
  );

  const [form, setForm] = useState(() => (isEdit ? {
    sku: product.sku ?? '', name: product.name ?? '', category: product.category ?? '',
    costPrice: product.costPrice ?? '', sellingPrice: product.sellingPrice ?? '',
    stockOnHand: product.stockOnHand ?? '', stockInTransit: product.stockInTransit ?? '',
    abcClass: product.abcClass || 'C', lifespanMonths: product.lifespanMonths ?? '',
    leadTimeDays: product.leadTimeDays ?? '', dailyConsumption: product.dailyConsumption ?? '',
  } : {
    sku: '', name: '', category: '', costPrice: '', sellingPrice: '',
    stockOnHand: '', stockInTransit: '', abcClass: 'C', lifespanMonths: '', leadTimeDays: '', dailyConsumption: '',
  }));
  // Show the current photo (live imageUrl or bundled map) as the starting preview.
  const existingImage = isEdit ? (product.imageUrl || catalogueImage(product.sku)) : null;
  const [imageData, setImageData] = useState(null); // { dataUrl, contentType, filename }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const pickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { setError('Please choose an image file.'); return; }
    if (file.size > 6 * 1024 * 1024) { setError('Image must be under 6MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => setImageData({ dataUrl: reader.result, contentType: file.type, filename: file.name });
    reader.readAsDataURL(file);
    setError(null);
  };

  const margin = (() => {
    const c = Number(form.costPrice); const p = Number(form.sellingPrice);
    if (!p || !Number.isFinite(c) || !Number.isFinite(p)) return null;
    return ((p - c) / p) * 100;
  })();

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!live) { setError('Managing products writes to the live catalogue, which is only available when signed in against the commerce backend.'); return; }
    if (!form.sku.trim() || !form.name.trim()) { setError('Product code and name are required.'); return; }

    setBusy(true);
    try {
      let imageUrl;
      if (imageData) {
        const up = await uploadProductImage(
          { sku: form.sku.trim(), filename: imageData.filename, contentType: imageData.contentType, dataBase64: imageData.dataUrl },
          scope,
        );
        imageUrl = up.url;
      }

      const payload = {
        name: form.name.trim(),
        category: form.category.trim(),
        costPrice: Number(form.costPrice) || 0,
        sellingPrice: Number(form.sellingPrice) || 0,
        stockOnHand: Number(form.stockOnHand) || 0,
        abcClass: form.abcClass,
        lifespanMonths: Number(form.lifespanMonths) || 0,
        leadTimeDays: Number(form.leadTimeDays) || 0,
        dailyConsumption: Number(form.dailyConsumption) || 0,
        ...(imageUrl ? { imageUrl } : {}),
      };

      if (isEdit) {
        await updateProduct(product.id, payload, scope);
        triggerNotification('Product updated', `${form.name.trim()} has been updated.`, 'success');
      } else {
        await createProduct({ ...payload, sku: form.sku.trim(), stockInTransit: Number(form.stockInTransit) || 0 }, scope);
        triggerNotification('Product added', `${form.name.trim()} is now live in the catalogue.`, 'success');
      }
      refreshCatalogue();
      onClose();
    } catch (err) {
      setError(err?.message ?? 'The product could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-hd">
          <div>
            <h3>{isEdit ? 'Edit product' : 'Add product'}</h3>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>Writes to your live catalogue · Contract price list B</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <form className="modal-bd" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!live && (
            <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
              <div className="card-bd" style={{ padding: 12, fontSize: 13, color: 'var(--text-muted)' }}>
                You're viewing demo data. Sign in against the commerce backend to add real products.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Image picker */}
            <div style={{ width: 132, flex: '0 0 auto' }}>
              <button type="button" className="thumb" onClick={() => fileRef.current?.click()}
                style={{ height: 132, width: 132, padding: 0, overflow: 'hidden', cursor: 'pointer', flexDirection: 'column', gap: 6, background: imageData ? '#fff' : 'var(--surface-2)' }}>
                {imageData
                  ? <img src={imageData.dataUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : existingImage
                    ? <img src={existingImage} alt={form.name || 'product'} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : <><UploadCloud size={22} /><span style={{ fontSize: 11 }}>Add photo</span></>}
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} style={{ display: 'none' }} />
              {imageData && <button type="button" className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 6 }} onClick={() => setImageData(null)}>Remove</button>}
            </div>

            <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="field"><label className="field-label">Product name *</label><input className="input" value={form.name} onChange={set('name')} placeholder="DROMEX ARC 40 CAL WINTER JACKET" required /></div>
              <div className="cols cols-2">
                <div className="field"><label className="field-label">Product code (SKU) *</label><input className="input" value={form.sku} onChange={set('sku')} placeholder="DW-ARC40-WJ" required disabled={isEdit} title={isEdit ? 'SKU cannot be changed' : undefined} /></div>
                <div className="field">
                  <label className="field-label">Category</label>
                  <input className="input" list="cat-list" value={form.category} onChange={set('category')} placeholder="Arc Flash Protection" />
                  <datalist id="cat-list">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                </div>
              </div>
            </div>
          </div>

          <div className="cols cols-2">
            <div className="field"><label className="field-label">Cost price (R)</label><input type="number" step="0.01" min="0" className="input" value={form.costPrice} onChange={set('costPrice')} placeholder="1700.00" /></div>
            <div className="field"><label className="field-label">Selling price (R)</label><input type="number" step="0.01" min="0" className="input" value={form.sellingPrice} onChange={set('sellingPrice')} placeholder="2900.00" /></div>
          </div>

          {margin !== null && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <span className="muted">Margin</span>
              <span className={`badge ${margin >= 30 ? 'badge-success' : margin >= 18 ? 'badge-warning' : 'badge-danger'}`}>{margin.toFixed(1)}%</span>
            </div>
          )}

          <div className="cols cols-2">
            <div className="field"><label className="field-label">Stock on hand</label><input type="number" min="0" className="input" value={form.stockOnHand} onChange={set('stockOnHand')} placeholder="0" /></div>
            <div className="field"><label className="field-label">In transit</label><input type="number" min="0" className="input" value={form.stockInTransit} onChange={set('stockInTransit')} placeholder="0" /></div>
          </div>

          <details>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}>Planning fields (optional)</summary>
            <div className="cols cols-2" style={{ marginTop: 10 }}>
              <div className="field">
                <label className="field-label">ABC class</label>
                <select className="select" value={form.abcClass} onChange={set('abcClass')}>{ABC.map((a) => <option key={a} value={a}>{a}</option>)}</select>
              </div>
              <div className="field"><label className="field-label">Lifespan (months)</label><input type="number" step="0.1" min="0" className="input" value={form.lifespanMonths} onChange={set('lifespanMonths')} placeholder="12" /></div>
              <div className="field"><label className="field-label">Lead time (days)</label><input type="number" min="0" className="input" value={form.leadTimeDays} onChange={set('leadTimeDays')} placeholder="14" /></div>
              <div className="field"><label className="field-label">Daily consumption</label><input type="number" step="0.1" min="0" className="input" value={form.dailyConsumption} onChange={set('dailyConsumption')} placeholder="0.5" /></div>
            </div>
          </details>

          {error && <div className="card" style={{ boxShadow: 'none', borderColor: 'var(--danger)' }}><div className="card-bd" style={{ padding: 12, color: 'var(--danger)', fontSize: 13 }}>{error}</div></div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !live}>
              {busy ? <><Loader2 size={16} className="spin" /> Saving…</> : <><Save size={16} /> Add product</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
