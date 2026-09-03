import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { getVariantOptions } from '../data/mockData';
import { resolveEmployeeEntitlement } from '../entitlement/entitlement';
import { fetchStoreOrders, collectStoreOrder, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { ProductThumb } from './ProductThumb';
import { SignaturePad } from './SignaturePad';
import {
  QrCode, ScanLine, PackageOpen, ShieldCheck, CheckCircle2, Signature,
  ShoppingBag, Search, Plus, User, Camera, Image, AlertTriangle, Printer,
  FileText, ArrowRight, X, Clock, Check, Building2, HardHat, Lock, Store, Loader2, RefreshCw
} from 'lucide-react';

const randZar = (n) => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Contractor-store pickup queue: paid store sales appear here so the storekeeper
// can verify the buyer's pickup code and hand over the goods (mark collected).
const StorePickups = () => {
  const { auth, tenantAccess, triggerNotification } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [codeInput, setCodeInput] = useState({}); // id -> typed code
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState('');

  React.useEffect(() => {
    if (!live) { setOrders([]); return; }
    let active = true;
    setLoading(true);
    fetchStoreOrders(scope)
      .then((r) => { if (active) setOrders(r.orders ?? []); })
      .catch(() => { if (active) setOrders([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, scope.accessToken, scope.tenantId, scope.siteId, reloadKey]);

  const collect = async (o) => {
    // Release ONLY against the code the contractor presents — never without it.
    const code = (codeInput[o.id] || '').trim();
    if (!code) {
      triggerNotification('Pickup code required', 'Enter the code the contractor was given at checkout — a pickup cannot be released without it.', 'warning');
      return;
    }
    setBusyId(o.id);
    try {
      await collectStoreOrder(o.id, code, scope);
      triggerNotification('Collected', `${o.reference} handed over to ${o.buyerName || 'buyer'}.`, 'success');
      setCodeInput((c) => ({ ...c, [o.id]: '' }));
      setReloadKey((k) => k + 1);
    } catch (e) {
      triggerNotification('Cannot collect', e.message || 'Pickup code did not match.', 'danger');
    } finally { setBusyId(null); }
  };

  // The storekeeper must not see the code (it's what proves the buyer's identity),
  // so it is never searchable or shown here — the contractor presents it.
  const q = search.trim().toLowerCase();
  const rows = orders.filter((o) => !q || [o.reference, o.buyerName, o.buyerEmail, o.company].some((v) => String(v || '').toLowerCase().includes(q)));
  const waiting = rows.filter((o) => o.status === 'paid');

  return (
    <div className="card">
      <div className="card-hd" style={{ gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Store size={17} style={{ color: 'var(--primary)' }} /><h3>Contractor store pickups</h3><span className={`badge ${waiting.length ? 'badge-warning' : 'badge-neutral'}`}>{waiting.length} awaiting collection</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={14} style={{ position: 'absolute', left: 9, color: 'var(--text-subtle)' }} />
            <input className="input" placeholder="Search code, buyer, ref…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 30, width: 210, height: 34 }} />
          </div>
          {live && <button className="btn btn-ghost btn-sm" onClick={() => setReloadKey((k) => k + 1)} disabled={loading} aria-label="Refresh">{loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}</button>}
        </div>
      </div>
      {!live ? (
        <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>Connect the live backend to see contractor-store pickups.</div>
      ) : rows.length === 0 ? (
        <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>{loading ? 'Loading…' : 'No paid store orders waiting for collection.'}</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Reference</th><th>Buyer</th><th className="num">Items</th><th className="num">Total</th><th className="center">Pickup code</th><th className="center">Status</th><th className="center">Collect</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} style={{ opacity: o.status === 'collected' ? 0.6 : 1 }}>
                  <td><div style={{ fontWeight: 500 }}>{o.reference}</div><div className="eyebrow">{(o.paidAt || o.createdAt || '').slice(0, 10)}</div></td>
                  <td>{o.buyerName || o.buyerEmail || 'Buyer'}<div className="eyebrow">{o.company || o.buyerEmail}</div></td>
                  <td className="num">{o.lineCount}</td>
                  <td className="num tabular">{randZar(o.total)}</td>
                  <td className="center"><span className="badge badge-neutral" title="The contractor presents this code at the counter — it is not shown here" style={{ letterSpacing: '.2em', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Lock size={11} /> ••••••</span></td>
                  <td className="center"><span className={`badge ${o.status === 'collected' ? 'badge-neutral' : 'badge-success'}`}>{o.status}</span></td>
                  <td className="center" style={{ whiteSpace: 'nowrap' }}>
                    {o.status === 'collected' ? (
                      <span className="muted" style={{ fontSize: 12 }}>{(o.collectedAt || '').slice(0, 10) || 'done'}</span>
                    ) : (
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <input className="input" placeholder="Enter code" value={codeInput[o.id] || ''} onChange={(e) => setCodeInput((c) => ({ ...c, [o.id]: e.target.value }))} style={{ width: 100, height: 32, textTransform: 'uppercase' }} />
                        <button className="btn btn-primary btn-sm" disabled={busyId === o.id || !(codeInput[o.id] || '').trim()} onClick={() => collect(o)}>{busyId === o.id ? <Loader2 size={13} className="spin" /> : <PackageOpen size={13} />} Hand over</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const CATEGORIES = ['ALL', 'Footwear', 'Workwear', 'Hand Protection', 'Respiratory Protection', 'Eye Protection', 'Arc Flash Protection'];

// Default sample photos for quick demo capture
const SAMPLE_STAFF_CARD = 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=400&q=80';
const SAMPLE_HANDOVER_PHOTO = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=80';

export const StorekeeperPortal = () => {
  const {
    products, requests, issueStockAndDeduct, employees, employeeAllocations,
    createRequest, triggerNotification, entitlementRules
  } = useApp();

  const [portalTab, setPortalTab] = useState('walkin'); // 'walkin' default | 'queue'
  const [otp, setOtp] = useState('');
  const [scanned, setScanned] = useState(null);
  const [oldReturned, setOldReturned] = useState(true);

  // Walk-in Catalogue State
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [walkinModalProduct, setWalkinModalProduct] = useState(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');

  // Walk-in Staff Form
  const [selectedEmpId, setSelectedEmpId] = useState('EM-8492'); // default John Sibanda
  const [isCustomStaff, setIsCustomStaff] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffId, setStaffId] = useState('');
  const [staffDept, setStaffDept] = useState('');
  const [staffRole, setStaffRole] = useState('');
  const [staffPlant, setStaffPlant] = useState('Kumba Iron Ore - Plant Alpha');
  const [issuerName, setIssuerName] = useState('S. Dlamini (Store 2)');
  const [issueReason, setIssueReason] = useState('Standard scheduled issue');
  const [customReason, setCustomReason] = useState('');

  // Audit Evidence
  const [staffCardPhoto, setStaffCardPhoto] = useState('');
  const [handoverPhoto, setHandoverPhoto] = useState('');
  const [workerSignature, setWorkerSignature] = useState('');
  const [issuedReceipt, setIssuedReceipt] = useState(null);

  const approved = requests.filter(r => r.status === 'APPROVED');

  // A ticket is only releasable when the storekeeper has keyed in the exact
  // pickup code (OTP) the worker was given at approval — the code that syncs
  // with the pass shown in the worker's app.
  const codeMatches = !!(scanned && otp.trim() && String(scanned.otp).toLowerCase() === otp.trim().toLowerCase());

  // Verify Queue Item — match strictly on the released pickup code (not the
  // request id, which is visible and would bypass the code).
  const verify = (e) => {
    e.preventDefault();
    const entered = otp.trim();
    const found = approved.find(r => String(r.otp).toLowerCase() === entered.toLowerCase());
    if (found) {
      setScanned(found);
      setOldReturned(!found.isEarlyReplacement);
    } else {
      triggerNotification('Invalid code', 'No approved pickup ticket matches that code.', 'warning');
    }
  };

  const dispenseQueue = () => {
    if (!scanned) return;
    if (!codeMatches) {
      triggerNotification('Pickup code required', 'Enter the pickup code the worker was given — it must match the ticket before stock can be released.', 'warning');
      return;
    }
    if (scanned.isEarlyReplacement && !oldReturned) {
      triggerNotification('Return Required', 'Anti-theft protocol: old damaged item must be returned before issuing.', 'warning');
      return;
    }
    issueStockAndDeduct(scanned.id);
    setScanned(null);
    setOtp('');
  };

  // Catalogue Filtering
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = search.toLowerCase();
      const match = p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      const catMatch = category === 'ALL' || p.category === category;
      return match && catMatch;
    });
  }, [products, search, category]);

  // Open Walk-in Modal for a product
  const openWalkinModal = (product) => {
    const opts = getVariantOptions(product);
    setWalkinModalProduct(product);
    setSelectedSize(opts.sizes[0] || 'Standard');
    setSelectedColor(opts.colors[0] || '—');
    setStaffCardPhoto('');
    setHandoverPhoto('');
    setWorkerSignature('');
    setIsCustomStaff(false);
    setSelectedEmpId(employees?.[0]?.id || 'EM-8492');
    setIssueReason('Standard scheduled issue');
    setCustomReason('');
  };

  // Resolve current active staff details
  const activeStaff = useMemo(() => {
    if (isCustomStaff) {
      return {
        id: staffId.trim() || 'EXT-WALKIN',
        name: staffName.trim() || 'Walk-in Contractor',
        department: staffDept.trim() || 'Operations & Contractors',
        role: staffRole.trim() || 'Site Worker',
        plant: staffPlant,
      };
    }
    const found = (employees || []).find((e) => e.id === selectedEmpId);
    return found || {
      id: selectedEmpId,
      name: 'John Sibanda',
      department: 'Engineering & Maintenance',
      role: 'Boilermaker / Welder',
      plant: 'Kumba Iron Ore - Plant Alpha',
    };
  }, [isCustomStaff, selectedEmpId, staffId, staffName, staffDept, staffRole, staffPlant, employees]);

  // Entitlement scoped to the walk-in staff member being served — the same
  // department/role/individual rules the worker's own request flow uses.
  const staffEntitlement = useMemo(() => resolveEmployeeEntitlement(activeStaff, entitlementRules), [activeStaff, entitlementRules]);
  const catAllowed = (p) => staffEntitlement.categories.has(p?.category);

  // Entitlement Rule Engine
  const entitlementCheck = useMemo(() => {
    if (!walkinModalProduct) return { isInfringement: false, reason: '', ruleLabel: 'Compliant' };

    const cat = walkinModalProduct.category || '';
    // Department/role/individual entitlement: a category outside the selected
    // employee's allocation must be co-signed by a manager.
    if (!staffEntitlement.categories.has(cat)) {
      return {
        isInfringement: true,
        tier: 2,
        reason: `${cat || 'This item'} is not in ${activeStaff.department}'s entitlement — Section Manager co-sign required.`,
        ruleLabel: 'Outside entitlement',
      };
    }
    const isCatA = cat === 'Footwear' || cat === 'Arc Flash Protection' || (walkinModalProduct.sellingPrice || 0) > 750;
    const isEarlyReason = issueReason === 'Damaged on shift' || issueReason === 'Lost / Emergency' || issueReason === 'Emergency replacement';

    // Check existing allocations for this worker
    const empAllocRecord = (employeeAllocations || []).find((e) => e.employeeId === activeStaff.id);
    const existingAllocations = empAllocRecord?.allocations || [];
    
    // Check if worker received an item in this category recently
    const recentSameCategory = existingAllocations.find((a) => {
      if (a.category === cat) {
        const days = (Date.now() - new Date(a.issueDate).getTime()) / (1000 * 60 * 60 * 24);
        return days < 180; // Within 6 months
      }
      return false;
    });

    if (isCatA && (isEarlyReason || recentSameCategory)) {
      return {
        isInfringement: true,
        reason: recentSameCategory
          ? `Quota Encroachment: ${cat} was already issued on ${recentSameCategory.issueDate} (${recentSameCategory.name}). High-value item requires Section Manager co-sign.`
          : `Early replacement reason (${issueReason}) for Category A equipment requires Section Manager approval.`,
        ruleLabel: 'Tier 2 Section Manager Co-Sign Required',
        tier: 2,
      };
    }

    if (isEarlyReason) {
      return {
        isInfringement: true,
        reason: `Early out-of-cycle replacement (${issueReason}) requires supervisor co-sign.`,
        ruleLabel: 'Tier 1 Supervisor Co-Sign Required',
        tier: 1,
      };
    }

    return {
      isInfringement: false,
      reason: 'Standard routine quota compliant. Ready for immediate counter handover.',
      ruleLabel: '100% Entitlement Compliant',
      tier: 0,
    };
  }, [walkinModalProduct, issueReason, activeStaff, employeeAllocations, staffEntitlement]);

  // Handle Walk-in Submission
  const handleWalkinSubmit = (e) => {
    e.preventDefault();
    if (!walkinModalProduct) return;

    if (!staffCardPhoto) {
      triggerNotification('Missing Staff Card', 'Mandatory: Capture or upload staff mine card photo for audit trail.', 'warning');
      return;
    }

    if (!handoverPhoto && !entitlementCheck.isInfringement) {
      triggerNotification('Missing Handover Photo', 'Mandatory: Capture photo of the worker holding their PPE.', 'warning');
      return;
    }

    if (!workerSignature) {
      triggerNotification('Missing Signature', 'Mandatory: Worker must provide signature acknowledging handover.', 'warning');
      return;
    }

    const colorTag = selectedColor && selectedColor !== '—' ? `-${selectedColor.split(' ')[0].slice(0, 3).toUpperCase()}` : '';
    const variantLabel = `${selectedSize}${selectedColor && selectedColor !== '—' ? ` · ${selectedColor}` : ''}`;
    const finalSku = `${walkinModalProduct.sku}-${selectedSize}${colorTag}`;
    const finalItemName = `${walkinModalProduct.name} (${variantLabel})`;
    const finalReason = issueReason === 'Other (specify)' ? customReason : issueReason;
    const nowStamp = new Date().toISOString().replace('T', ' ').substring(0, 16);

    // Case 1: Entitlement Infringement -> Route to Manager Approval
    if (entitlementCheck.isInfringement) {
      const newReq = createRequest({
        ...walkinModalProduct,
        sku: finalSku,
        name: finalItemName,
        employeeId: activeStaff.id,
        employeeName: activeStaff.name,
        department: activeStaff.department,
        plant: activeStaff.plant,
        reason: finalReason,
        isEarlyReplacement: true,
        approvalTierRequired: entitlementCheck.tier || 2,
        photoProofUrl: staffCardPhoto,
        staffCardPhotoUrl: staffCardPhoto,
        handoverPhotoUrl: handoverPhoto || null,
        status: 'PENDING_APPROVAL',
        tier1Status: entitlementCheck.tier === 2 ? 'PENDING_SUPERVISOR' : 'PENDING_SUPERVISOR',
        tier2Status: entitlementCheck.tier === 2 ? 'PENDING_MINE_MANAGER' : 'NOT_REQUIRED',
        issuedBy: issuerName,
      });

      triggerNotification(
        'Approval Ticket Dispatched',
        `Entitlement Infringement: Request ${newReq.id} routed to Manager Approvals portal with audit evidence.`,
        'warning'
      );

      setWalkinModalProduct(null);
      return;
    }

    // Case 2: Compliant -> Immediate Dispense & Record Allocation
    const reqId = `REQ-WALKIN-${Math.floor(1000 + Math.random() * 9000)}`;
    const mockReq = {
      id: reqId,
      sku: finalSku,
      itemName: finalItemName,
      category: walkinModalProduct.category,
      employeeId: activeStaff.id,
      employeeName: activeStaff.name,
      department: activeStaff.department,
      role: activeStaff.role,
      plant: activeStaff.plant,
      sellingPrice: walkinModalProduct.sellingPrice,
      unitPrice: walkinModalProduct.sellingPrice,
      costPrice: walkinModalProduct.costPrice,
      issuedBy: issuerName,
      staffCardPhotoUrl: staffCardPhoto,
      handoverPhotoUrl: handoverPhoto,
      signedBy: activeStaff.name,
      approvalRef: 'Compliant (Auto-dispensed at counter)',
    };

    // Immediate over-the-counter dispense: record THIS walk-in request as
    // fulfilled and move stock + custody + allocation in one shot. Pass the
    // object directly (not an id) so it doesn't depend on a not-yet-committed
    // `requests` update, and so it's keyed to the served staff, not activeEmployee.
    issueStockAndDeduct(mockReq, {
      staffCardPhotoUrl: staffCardPhoto,
      handoverPhotoUrl: handoverPhoto,
      issuedBy: issuerName,
      signedBy: activeStaff.name,
    });

    setIssuedReceipt({
      reqId,
      sku: finalSku,
      itemName: finalItemName,
      staff: activeStaff,
      timestamp: nowStamp,
      issuer: issuerName,
      reason: finalReason,
      staffCardPhoto,
      handoverPhoto,
      signature: workerSignature,
      price: walkinModalProduct.sellingPrice,
    });

    setWalkinModalProduct(null);
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 24 }}>
      {/* Page Header with Mode Selector */}
      <div className="page-head">
        <div>
          <h2>Store Counter · {staffPlant}</h2>
          <p>Scan pickup tickets or service walk-in staff directly from the approved PPE catalogue with full photo audit.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="segment">
            <button className={portalTab === 'queue' ? 'on' : ''} onClick={() => setPortalTab('queue')}>
              <ScanLine size={14} /> Queue Pickup ({approved.length})
            </button>
            <button className={portalTab === 'walkin' ? 'on accent' : ''} onClick={() => setPortalTab('walkin')}>
              <ShoppingBag size={14} /> Walk-in Approved Catalogue
            </button>
            <button className={portalTab === 'store' ? 'on' : ''} onClick={() => setPortalTab('store')}>
              <Store size={14} /> Store Pickups
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 3: CONTRACTOR STORE PICKUPS (paid store sales → collect by code)
      ───────────────────────────────────────────────────────────── */}
      {portalTab === 'store' && <StorePickups />}

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: QUEUE PICKUP (Existing Verification)
      ───────────────────────────────────────────────────────────── */}
      {portalTab === 'queue' && (
        <div className="cols" style={{ gridTemplateColumns: 'minmax(260px, 340px) 1fr' }}>
          {/* Scan + Queue List */}
          <div className="card">
            <div className="card-bd">
              <form onSubmit={verify}>
                <div className="thumb" style={{ padding: '22px 12px', flexDirection: 'column', gap: 8, color: 'var(--text-muted)' }}>
                  <ScanLine size={30} />
                  <span style={{ fontSize: 13 }}>Scan worker badge or QR</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <input
                    className="input"
                    style={{ letterSpacing: '.12em' }}
                    placeholder="Enter pickup code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    required
                  />
                  <button className="btn btn-primary" type="submit">Verify</button>
                </div>
              </form>

              <div className="eyebrow" style={{ margin: '18px 0 10px' }}>Approved Queue · {approved.length}</div>
              {approved.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No approved tickets waiting.</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {approved.map((req) => {
                  const active = scanned && scanned.id === req.id;
                  return (
                    <button
                      key={req.id}
                      onClick={() => {
                        // Load the ticket for review, but clear any code — the
                        // worker must present it; it is never auto-filled.
                        setOtp('');
                        setScanned(req);
                        setOldReturned(!req.isEarlyReplacement);
                      }}
                      className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ justifyContent: 'space-between' }}
                    >
                      <span>{req.employeeName.split(' ').slice(-1)[0]} · {req.itemName.split(' ').slice(0, 2).join(' ')}</span>
                      <span style={{ fontSize: 11, opacity: 0.6, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Lock size={10} /> code</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Verification Console */}
          <div className="card">
            {scanned ? (
              <>
                <div className="card-hd">
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>{scanned.employeeName}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{scanned.employeeId} · {scanned.department} · {scanned.plant}</div>
                  </div>
                  <span className={`badge ${codeMatches ? 'badge-success' : 'badge-warning'}`}>{codeMatches ? <><CheckCircle2 size={13} /> Pickup code verified</> : <><Lock size={13} /> Awaiting pickup code</>}</span>
                </div>
                <div className="card-bd">
                  <div className="table-wrap card" style={{ boxShadow: 'none' }}>
                    <table className="table">
                      <thead>
                        <tr><th>Item</th><th>SKU</th><th className="center">Qty</th><th className="center">Status</th></tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ fontWeight: 500 }}>{scanned.itemName}</td>
                          <td className="muted">{scanned.sku}</td>
                          <td className="center">1</td>
                          <td className="center"><span className="badge badge-success">Approved</span></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    {scanned.isEarlyReplacement ? (
                      <label className="card" style={{ padding: 13, display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', boxShadow: 'none', borderColor: oldReturned ? 'var(--border)' : 'var(--primary)', background: oldReturned ? 'var(--surface)' : 'var(--danger-weak)' }}>
                        <input type="checkbox" checked={oldReturned} onChange={(e) => setOldReturned(e.target.checked)} />
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 500 }}>
                          <ShieldCheck size={15} style={{ color: 'var(--primary)' }} /> Mandatory: old damaged item handed back &amp; scrapped
                        </span>
                      </label>
                    ) : (
                      <div className="badge badge-success" style={{ padding: '8px 12px' }}>
                        <CheckCircle2 size={14} /> Routine quota issue — compliant
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginTop: 18, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <div className="field" style={{ margin: 0, minWidth: 200 }}>
                      <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Lock size={12} /> Pickup code from worker</label>
                      <input
                        className="input"
                        style={{ letterSpacing: '.18em', textTransform: 'uppercase' }}
                        placeholder="Enter code the worker presents"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                      />
                    </div>
                    <button className="btn btn-primary btn-lg" onClick={dispenseQueue} disabled={!codeMatches} title={codeMatches ? 'Release stock' : 'Enter the matching pickup code to release'}>
                      <PackageOpen size={17} /> Dispense &amp; update allocation
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="card-bd" style={{ textAlign: 'center', padding: '56px 20px' }}>
                <QrCode size={44} style={{ color: 'var(--text-subtle)' }} />
                <h3 style={{ marginTop: 12 }}>Ready for counter verification</h3>
                <p className="muted" style={{ marginTop: 6, fontSize: 13.5 }}>Scan a worker QR or enter ticket OTP to load handover checklist.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: WALK-IN APPROVED CATALOGUE (New Feature)
      ───────────────────────────────────────────────────────────── */}
      {portalTab === 'walkin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Filter Bar */}
          <div className="card" style={{ padding: 12 }}>
            {/* Serving — the walk-in employee whose entitlement scopes the catalogue */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid var(--border)' }}>
              <span className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><User size={13} /> Serving</span>
              <select className="select" value={isCustomStaff ? '' : selectedEmpId} onChange={(e) => { setIsCustomStaff(false); setSelectedEmpId(e.target.value); }} style={{ width: 'auto', minWidth: 240, fontWeight: 600 }}>
                {(employees || []).map((e) => <option key={e.id} value={e.id}>{e.name} · {e.role} · {e.department}</option>)}
              </select>
              <span className="badge badge-neutral" style={{ fontSize: 10.5 }} title={[...staffEntitlement.categories].join(', ')}>{activeStaff.department} · {staffEntitlement.categories.size} categories allowed</span>
              <span className="muted" style={{ fontSize: 12 }}>Restricted items need a Section-Manager co-sign.</span>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 10, flex: '1 1 300px', alignItems: 'center' }}>
                <div style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
                  <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
                  <input
                    type="text"
                    className="input"
                    style={{ paddingLeft: 34 }}
                    placeholder="Search approved SKU or product name…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    className={`btn btn-sm ${category === c ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Product Grid */}
          <div className="cards-cv" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {filteredProducts.map((p) => {
              const opts = getVariantOptions(p);
              const allowed = catAllowed(p);
              return (
                <div key={p.sku} className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderColor: allowed ? 'var(--border)' : 'var(--warning)' }}>
                  <div style={{ background: 'var(--surface-2)', padding: 16, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 140, position: 'relative' }}>
                    <ProductThumb sku={p.sku} name={p.name} imageUrl={p.imageUrl} size={110} />
                    {!allowed && <span className="badge badge-warning" style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Lock size={10} /> Restricted</span>}
                  </div>
                  <div className="card-bd" style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 8, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span className="eyebrow">{p.category}</span>
                      <span className={`badge ${p.stockOnHand > 10 ? 'badge-success' : p.stockOnHand > 0 ? 'badge-warning' : 'badge-danger'}`}>
                        {p.stockOnHand} on hand
                      </span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14.5, minHeight: 40, lineHeight: 1.3 }}>{p.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>SKU: {p.sku} · {opts.sizes.length} sizes</div>
                    {!allowed && <div style={{ fontSize: 11.5, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} /> Not in {activeStaff.department}'s entitlement</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--primary)' }}>
                        R {Number(p.sellingPrice || 0).toFixed(2)}
                      </div>
                      <button
                        className={`btn btn-sm ${allowed ? 'btn-primary' : 'btn-secondary'}`}
                        disabled={p.stockOnHand <= 0}
                        title={allowed ? 'Issue to staff' : `Outside ${activeStaff.department}'s entitlement — needs a manager co-sign`}
                        onClick={() => openWalkinModal(p)}
                      >
                        {allowed ? <><Plus size={14} /> Issue to staff</> : <><Lock size={13} /> Issue (co-sign)</>}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          WALK-IN HANDOVER & AUDIT MODAL
      ───────────────────────────────────────────────────────────── */}
      {walkinModalProduct && (
        <div className="overlay" onClick={() => setWalkinModalProduct(null)}>
          <div className="modal modal-lg" style={{ maxWidth: 740, maxHeight: 'min(86vh, 640px)', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <HardHat size={19} style={{ color: 'var(--primary)' }} />
                <h3>Walk-in Staff PPE Issue &amp; Audit</h3>
              </div>
              <button className="icon-btn" onClick={() => setWalkinModalProduct(null)}><X size={17} /></button>
            </div>

            <form onSubmit={handleWalkinSubmit} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
              <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', flex: '1 1 auto', minHeight: 0, padding: '14px 18px' }}>
              {/* Product & Variant Pick */}
              <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)', padding: 12 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <ProductThumb sku={walkinModalProduct.sku} name={walkinModalProduct.name} imageUrl={walkinModalProduct.imageUrl} size={50} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5 }}>{walkinModalProduct.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>SKU: {walkinModalProduct.sku} · Category: {walkinModalProduct.category}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--primary)' }}>R {Number(walkinModalProduct.sellingPrice || 0).toFixed(2)}</div>
                    <span className="badge badge-success">{walkinModalProduct.stockOnHand} in stock</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                  <div className="field" style={{ flex: 1, margin: 0 }}>
                    <label className="field-label" style={{ fontSize: 11, marginBottom: 3 }}>Size</label>
                    <select className="select" value={selectedSize} onChange={(e) => setSelectedSize(e.target.value)}>
                      {getVariantOptions(walkinModalProduct).sizes.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ flex: 1, margin: 0 }}>
                    <label className="field-label" style={{ fontSize: 11, marginBottom: 3 }}>Colour</label>
                    <select className="select" value={selectedColor} onChange={(e) => setSelectedColor(e.target.value)}>
                      {getVariantOptions(walkinModalProduct).colors.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Staff Details Section */}
              <div className="card" style={{ boxShadow: 'none', border: '1px solid var(--border)', padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13.5 }}>
                    <User size={15} style={{ color: 'var(--primary)' }} /> Staff Identification (Required)
                  </div>
                  <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={isCustomStaff} onChange={(e) => setIsCustomStaff(e.target.checked)} />
                    Manual Walk-in / Contractor
                  </label>
                </div>

                {!isCustomStaff ? (
                  <div className="field" style={{ margin: 0 }}>
                    <label className="field-label" style={{ fontSize: 11, marginBottom: 3 }}>Select Plant Employee</label>
                    <select className="select" value={selectedEmpId} onChange={(e) => setSelectedEmpId(e.target.value)}>
                      {(employees || []).map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} ({e.id}) · {e.department} · {e.role}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="field-label" style={{ fontSize: 11, marginBottom: 3 }}>Employee Number / ID</label>
                      <input className="input" placeholder="e.g. EM-9912" value={staffId} onChange={(e) => setStaffId(e.target.value)} required />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="field-label" style={{ fontSize: 11, marginBottom: 3 }}>Full Name</label>
                      <input className="input" placeholder="e.g. Sipho Ndlovu" value={staffName} onChange={(e) => setStaffName(e.target.value)} required />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="field-label" style={{ fontSize: 11, marginBottom: 3 }}>Department</label>
                      <input className="input" placeholder="e.g. Extraction Shaft 4" value={staffDept} onChange={(e) => setStaffDept(e.target.value)} required />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="field-label" style={{ fontSize: 11, marginBottom: 3 }}>Role / Title</label>
                      <input className="input" placeholder="e.g. Rigger / Welder" value={staffRole} onChange={(e) => setStaffRole(e.target.value)} required />
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label className="field-label" style={{ fontSize: 11, marginBottom: 3 }}>Issue Reason</label>
                    <select className="select" value={issueReason} onChange={(e) => setIssueReason(e.target.value)}>
                      <option value="Standard scheduled issue">Standard scheduled quota issue</option>
                      <option value="Damaged on shift">Damaged on shift (Handback verified)</option>
                      <option value="Lost / Emergency">Lost / Emergency shift replacement</option>
                      <option value="New deployment">New mine deployment / Onboarding</option>
                      <option value="Visitor / Contractor">Visitor / Temporary contractor pass</option>
                      <option value="Other (specify)">Other (specify)</option>
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label className="field-label" style={{ fontSize: 11, marginBottom: 3 }}>Storekeeper / Issuer</label>
                    <input className="input" value={issuerName} onChange={(e) => setIssuerName(e.target.value)} required />
                  </div>
                </div>

                {issueReason === 'Other (specify)' && (
                  <div className="field" style={{ marginTop: 8, margin: 0 }}>
                    <label className="field-label" style={{ fontSize: 11, marginBottom: 3 }}>Specify Reason</label>
                    <input className="input" placeholder="Explain reason for issue…" value={customReason} onChange={(e) => setCustomReason(e.target.value)} required />
                  </div>
                )}
              </div>

              {/* Entitlement Status Banner */}
              <div
                className="card"
                style={{
                  boxShadow: 'none',
                  padding: '10px 14px',
                  background: entitlementCheck.isInfringement ? 'var(--danger-weak)' : 'var(--success-weak)',
                  border: `1px solid ${entitlementCheck.isInfringement ? 'var(--danger)' : 'var(--success)'}`
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {entitlementCheck.isInfringement ? (
                    <AlertTriangle size={17} style={{ color: 'var(--danger)' }} />
                  ) : (
                    <ShieldCheck size={17} style={{ color: 'var(--success)' }} />
                  )}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: entitlementCheck.isInfringement ? 'var(--danger)' : 'var(--success)' }}>
                      {entitlementCheck.ruleLabel}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.9 }}>{entitlementCheck.reason}</div>
                  </div>
                </div>
              </div>

              {/* Dual Audit Photo Verification */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Photo 1: Staff Mine Card */}
                <div className="card" style={{ boxShadow: 'none', border: '1px solid var(--border)', padding: 12 }}>
                  <div className="field-label" style={{ fontSize: 11.5, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Camera size={13} style={{ color: 'var(--primary)' }} /> 1. Staff Mine Card Photo <span style={{ color: 'var(--danger)' }}>*</span>
                  </div>
                  {staffCardPhoto ? (
                    <div style={{ position: 'relative', height: 90, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <img src={staffCardPhoto} alt="Staff Card" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button type="button" className="btn btn-sm btn-secondary" style={{ position: 'absolute', bottom: 4, right: 4, padding: '2px 8px', fontSize: 11 }} onClick={() => setStaffCardPhoto('')}>
                        Retake
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStaffCardPhoto(SAMPLE_STAFF_CARD)}>
                        <Camera size={13} /> Capture Staff Card
                      </button>
                      <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', textAlign: 'center' }}>
                        Upload Photo
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              const r = new FileReader();
                              r.onload = () => setStaffCardPhoto(r.result);
                              r.readAsDataURL(f);
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Photo 2: Person Holding PPE */}
                <div className="card" style={{ boxShadow: 'none', border: '1px solid var(--border)', padding: 12 }}>
                  <div className="field-label" style={{ fontSize: 11.5, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Image size={13} style={{ color: 'var(--primary)' }} /> 2. Person Holding PPE <span style={{ color: 'var(--danger)' }}>*</span>
                  </div>
                  {handoverPhoto ? (
                    <div style={{ position: 'relative', height: 90, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <img src={handoverPhoto} alt="Handover Proof" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button type="button" className="btn btn-sm btn-secondary" style={{ position: 'absolute', bottom: 4, right: 4, padding: '2px 8px', fontSize: 11 }} onClick={() => setHandoverPhoto('')}>
                        Retake
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setHandoverPhoto(SAMPLE_HANDOVER_PHOTO)}>
                        <Camera size={13} /> Snap Handover Photo
                      </button>
                      <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', textAlign: 'center' }}>
                        Upload Photo
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              const r = new FileReader();
                              r.onload = () => setHandoverPhoto(r.result);
                              r.readAsDataURL(f);
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* Handover Signature */}
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label" style={{ fontSize: 11.5, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Signature size={13} /> Staff Handover Signature <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <SignaturePad onChange={setWorkerSignature} height={85} />
              </div>

              </div>{/* end scrollable body */}
              {/* Modal Footer Buttons — pinned so Cancel/Submit are always visible */}
              <div className="modal-ft" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setWalkinModalProduct(null)}>
                  Cancel
                </button>
                {entitlementCheck.isInfringement ? (
                  <button type="submit" className="btn btn-primary" style={{ background: 'var(--primary)', color: '#fff' }}>
                    <ShieldCheck size={15} /> Submit for Manager Approval
                  </button>
                ) : (
                  <button type="submit" className="btn btn-primary">
                    <PackageOpen size={15} /> Dispense Stock &amp; Print Slip
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          RECEIPT / HANDOVER SLIP PRINT MODAL
      ───────────────────────────────────────────────────────────── */}
      {issuedReceipt && (
        <div className="overlay" onClick={() => setIssuedReceipt(null)}>
          <div className="modal modal-md invoice-print" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
                <h3>Stock Handover Slip</h3>
              </div>
              <button className="icon-btn" onClick={() => setIssuedReceipt(null)}><X size={17} /></button>
            </div>
            <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 20px', fontSize: 13 }}>
              <div style={{ textAlign: 'center', borderBottom: '1px dashed var(--border)', paddingBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>KUMBA IRON ORE — SIGHTLIVE PPE</div>
                <div className="muted" style={{ fontSize: 11.5 }}>Store Counter Handover Slip · {issuedReceipt.timestamp}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><span className="muted">Worker:</span> <strong>{issuedReceipt.staff.name}</strong></div>
                <div><span className="muted">ID:</span> <strong>{issuedReceipt.staff.id}</strong></div>
                <div><span className="muted">Department:</span> {issuedReceipt.staff.department}</div>
                <div><span className="muted">Issuer:</span> {issuedReceipt.issuer}</div>
              </div>

              <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)', padding: 10 }}>
                <div style={{ fontWeight: 600 }}>{issuedReceipt.itemName}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>SKU: {issuedReceipt.sku} · Qty: 1 · Value: R {Number(issuedReceipt.price || 0).toFixed(2)}</div>
                <div style={{ fontSize: 11.5, marginTop: 4 }}>Reason: <strong>{issuedReceipt.reason}</strong></div>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div className="eyebrow" style={{ fontSize: 10 }}>Audit Evidence</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    {issuedReceipt.staffCardPhoto && (
                      <img src={issuedReceipt.staffCardPhoto} alt="Card" style={{ width: 44, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} />
                    )}
                    {issuedReceipt.handoverPhoto && (
                      <img src={issuedReceipt.handoverPhoto} alt="Handover" style={{ width: 44, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} />
                    )}
                  </div>
                </div>
                {issuedReceipt.signature && (
                  <div style={{ textAlign: 'right' }}>
                    <div className="eyebrow" style={{ fontSize: 10 }}>Signed By Worker</div>
                    <img src={issuedReceipt.signature} alt="Sig" style={{ height: 28, marginTop: 4, objectFit: 'contain' }} />
                  </div>
                )}
              </div>
            </div>
            <div className="modal-ft no-print" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary" onClick={() => setIssuedReceipt(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => window.print()}><Printer size={15} /> Print slip</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
