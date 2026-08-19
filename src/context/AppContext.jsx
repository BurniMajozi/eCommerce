import React, { createContext, useContext, useState, useEffect } from 'react';
import { CAGELI_PRODUCTS, MOCK_EMPLOYEES, MOCK_REQUESTS, MOCK_QUOTATIONS, MOCK_PLANTS, MOCK_TENANTS, MOCK_MODULES, MOCK_EMPLOYEE_ALLOCATIONS } from '../data/mockData';
import { buildDefaultRules, newRuleId } from '../entitlement/entitlement';
import { useAuthSession } from '../auth/AuthSessionContext';
import { useTenantAccess } from '../tenant/TenantAccessContext';
import { fetchCatalogue, fetchProfitability, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';

const AppContext = createContext();

const getInitialTheme = () => {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
  }
  return 'light';
};

export const AppProvider = ({ children }) => {
  const auth = useAuthSession();
  const tenantAccess = useTenantAccess();
  const canManageCommerce = tenantAccess.capabilities.includes('commerce.manage');
  const [theme, setTheme] = useState(getInitialTheme);
  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('sightlive-theme', theme); } catch { /* ignore */ }
  }, [theme]);

  const [products, setProducts] = useState(CAGELI_PRODUCTS);
  const [catalogue, setCatalogue] = useState({ source: 'demo', loading: false, error: null, dataQuality: null });
  const [profitability, setProfitability] = useState({ source: 'demo', loading: false, error: null, items: [], totals: null });
  const [activePlant, setActivePlant] = useState(MOCK_PLANTS[1]); // Default to Kumba Plant Alpha
  // EMPLOYEE, MANAGER, STOREKEEPER, MERCHANT, EXECUTIVE, TENANT_ADMIN, OWNER
  const [activeRole, setActiveRole] = useState('EMPLOYEE');
  const [tenants, setTenants] = useState(MOCK_TENANTS);
  const [selectedTenantId, setSelectedTenantId] = useState(MOCK_TENANTS[0].id);
  const [activeEmployee, setActiveEmployee] = useState(MOCK_EMPLOYEES[0]);
  // Department/role/individual entitlement rules — shared so the admin builder
  // and the worker request flow enforce the same policy.
  const [entitlementRules, setEntitlementRules] = useState(() => buildDefaultRules());
  const addEntitlementRule = (rule) => setEntitlementRules((prev) => [{ ...rule, id: rule.id || newRuleId() }, ...prev]);
  const removeEntitlementRule = (id) => setEntitlementRules((prev) => prev.filter((r) => r.id !== id));
  const [requests, setRequests] = useState(MOCK_REQUESTS);
  const [quotations, setQuotations] = useState(MOCK_QUOTATIONS);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [pushNotification, setPushNotification] = useState(null);
  const [taxEnabled, setTaxEnabled] = useState(true); // merchant setting: add VAT to quotes/invoices
  // Bumped after a catalogue write (new product) to re-run the live reads.
  const [catalogueReloadKey, setCatalogueReloadKey] = useState(0);
  const refreshCatalogue = () => setCatalogueReloadKey((k) => k + 1);

  const [employeeAllocations, setEmployeeAllocations] = useState(() => {
    try {
      const saved = localStorage.getItem('sightlive_employee_allocations');
      return saved ? JSON.parse(saved) : MOCK_EMPLOYEE_ALLOCATIONS;
    } catch {
      return MOCK_EMPLOYEE_ALLOCATIONS;
    }
  });

  const recordEmployeeAllocation = (allocData) => {
    setEmployeeAllocations((prev) => {
      let found = false;
      const next = prev.map((emp) => {
        if (emp.employeeId === allocData.employeeId) {
          found = true;
          return {
            ...emp,
            employeeName: allocData.employeeName || emp.employeeName,
            department: allocData.department || emp.department,
            allocations: [allocData.allocation, ...(emp.allocations || [])]
          };
        }
        return emp;
      });
      if (!found) {
        next.push({
          employeeId: allocData.employeeId,
          employeeName: allocData.employeeName,
          department: allocData.department,
          role: allocData.role || 'Mine Worker',
          plant: allocData.plant || 'Kumba Iron Ore - Plant Alpha',
          quotaUtilization: 50,
          allocations: [allocData.allocation]
        });
      }
      try { localStorage.setItem('sightlive_employee_allocations', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const [orderStatusOverrides, setOrderStatusOverridesState] = useState(() => {
    try {
      const saved = localStorage.getItem('sightlive_order_status_overrides');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const setOrderStatusOverride = (id, status) => {
    if (!id) return;
    setOrderStatusOverridesState((prev) => {
      const next = { ...prev, [id]: status };
      try { localStorage.setItem('sightlive_order_status_overrides', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  useEffect(() => {
    const accessToken = auth.session?.access_token;
    const tenantId = tenantAccess.activeTenantId;
    const siteId = tenantAccess.activeSiteId;
    if (!isMedusaCatalogueEnabled || !accessToken || !tenantId) {
      setProducts(CAGELI_PRODUCTS);
      setCatalogue({ source: 'demo', loading: false, error: null, dataQuality: null });
      return undefined;
    }

    const controller = new AbortController();
    setCatalogue((current) => ({ ...current, loading: true, error: null }));
    fetchCatalogue({ accessToken, tenantId, siteId, signal: controller.signal })
      .then((response) => {
        const costMap = new Map(CAGELI_PRODUCTS.map((cp) => [cp.sku, cp.costPrice]));
        const items = (response.items || []).map((item) => ({
          ...item,
          costPrice: item.costPrice ?? costMap.get(item.sku) ?? null,
        }));
        setProducts(items);
        setCatalogue({ source: 'medusa', loading: false, error: null, dataQuality: response.dataQuality ?? null });
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        // Once the live path is explicitly enabled, never disguise an auth,
        // scope or service failure as real catalogue data by showing mocks.
        setProducts([]);
        setCatalogue({ source: 'error', loading: false, error, dataQuality: null });
      });

    return () => controller.abort();
  }, [auth.session?.access_token, tenantAccess.activeTenantId, tenantAccess.activeSiteId, catalogueReloadKey]);

  useEffect(() => {
    const accessToken = auth.session?.access_token;
    const tenantId = tenantAccess.activeTenantId;
    const siteId = tenantAccess.activeSiteId;
    if (!isMedusaCatalogueEnabled || !accessToken || !tenantId || !canManageCommerce) {
      setProfitability({ source: 'demo', loading: false, error: null, items: [], totals: null });
      return undefined;
    }

    const controller = new AbortController();
    setProfitability((current) => ({ ...current, loading: true, error: null }));
    fetchProfitability({ accessToken, tenantId, siteId, signal: controller.signal })
      .then((response) => setProfitability({
        source: 'medusa', loading: false, error: null, items: response.items ?? [], totals: response.totals ?? null,
      }))
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        setProfitability({ source: 'error', loading: false, error, items: [], totals: null });
      });
    return () => controller.abort();
  }, [auth.session?.access_token, tenantAccess.activeTenantId, tenantAccess.activeSiteId, canManageCommerce, catalogueReloadKey]);

  const triggerNotification = (title, message, type = 'info') => {
    setPushNotification({ title, message, type, id: Date.now() });
    setTimeout(() => setPushNotification(null), 5000);
  };

  const createRequest = (newReqData) => {
    const isCategoryA = newReqData.abcClass === 'A' || newReqData.costPrice > 600;
    const req = {
      id: `REQ-${Math.floor(1000 + Math.random() * 9000)}`,
      employeeId: activeEmployee.id,
      employeeName: activeEmployee.name,
      department: activeEmployee.department,
      plant: activePlant.name,
      sku: newReqData.sku,
      itemName: newReqData.name,
      category: newReqData.category,
      costPrice: newReqData.costPrice,
      sellingPrice: newReqData.sellingPrice,
      abcClass: newReqData.abcClass,
      reason: newReqData.reason,
      isEarlyReplacement: newReqData.isEarlyReplacement || false,
      photoProofUrl: newReqData.photoProofUrl || null,
      requestDate: new Date().toISOString().replace('T', ' ').substring(0, 16),
      status: 'PENDING_APPROVAL',
      approvalTierRequired: isCategoryA || newReqData.isEarlyReplacement ? 2 : 1,
      tier1Status: 'PENDING_SUPERVISOR',
      tier2Status: isCategoryA || newReqData.isEarlyReplacement ? 'PENDING_MINE_MANAGER' : 'NOT_REQUIRED',
      otp: Math.floor(1000 + Math.random() * 9000).toString()
    };

    setRequests(prev => [req, ...prev]);
    triggerNotification(
      'PEP Request Submitted',
      `Request #${req.id} for ${req.itemName} is now awaiting ${req.approvalTierRequired === 2 ? 'Tier 2 Mine Manager' : 'Tier 1 Supervisor'} sign-off.`,
      'warning'
    );
    return req;
  };

  const approveRequest = (reqId, tierLevel, managerName = 'Mine Safety Manager') => {
    setRequests(prev => prev.map(r => {
      if (r.id === reqId) {
        let updated = { ...r };
        if (tierLevel === 1) {
          updated.tier1Status = `APPROVED_BY_${managerName.toUpperCase().replace(/\s+/g, '_')}`;
          if (r.approvalTierRequired === 1) updated.status = 'APPROVED';
        } else if (tierLevel === 2) {
          updated.tier2Status = `APPROVED_BY_${managerName.toUpperCase().replace(/\s+/g, '_')}`;
          updated.status = 'APPROVED';
        }
        return updated;
      }
      return r;
    }));

    triggerNotification(
      'PWA Push: Request Approved!',
      `Request ${reqId} approved. Digital pickup pass (QR Code) generated for employee.`,
      'success'
    );
  };

  const rejectRequest = (reqId, reason) => {
    setRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'REJECTED', rejectReason: reason } : r));
    triggerNotification('Request Declined', `Request ${reqId} was declined: ${reason}`, 'error');
  };

  const issueStockAndDeduct = (reqId, extraAudit = {}) => {
    const targetReq = requests.find(r => r.id === reqId);
    if (!targetReq) return;

    // Deduct stock
    setProducts(prev => prev.map(p => p.sku === targetReq.sku ? { ...p, stockOnHand: Math.max(0, p.stockOnHand - 1) } : p));
    
    // Mark request fulfilled
    setRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'FULFILLED_DISPATCHED', ...extraAudit } : r));

    // Update custody register
    setActiveEmployee(prev => ({
      ...prev,
      custody: [
        {
          sku: targetReq.sku,
          name: targetReq.itemName,
          issueDate: new Date().toISOString().substring(0, 10),
          lifespanMonths: 6,
          condition: 'New Issue',
          status: 'ACTIVE_CUSTODY'
        },
        ...prev.custody
      ]
    }));

    // Update employee allocation register
    const allocItem = {
      id: `ALC-${Math.floor(10000 + Math.random() * 90000)}`,
      sku: targetReq.sku,
      name: targetReq.itemName,
      category: targetReq.category || 'Mine PPE',
      qty: 1,
      unitPrice: targetReq.sellingPrice || targetReq.unitPrice || 0,
      totalValue: targetReq.sellingPrice || targetReq.unitPrice || 0,
      issueDate: new Date().toISOString().substring(0, 10),
      issuedBy: extraAudit.issuedBy || targetReq.issuedBy || 'S. Dlamini (Store 2)',
      serialNumber: `${(targetReq.sku || 'PPE').split('-')[0]}-${(targetReq.employeeId || '8492').replace('EM-', '')}-${Math.floor(10 + Math.random() * 90)}`,
      status: 'Active (In Use)',
      condition: 'New Issue',
      nextEligibleDate: new Date(Date.now() + 180 * 86400000).toISOString().substring(0, 10),
      signedBy: extraAudit.signedBy || targetReq.employeeName,
      approvalRef: targetReq.approvalTierRequired === 2 ? `APV-${targetReq.id} (Tier 2 Approved)` : (targetReq.approvalRef || 'Compliant (Auto-dispensed)'),
      staffCardPhotoUrl: extraAudit.staffCardPhotoUrl || targetReq.staffCardPhotoUrl || null,
      handoverPhotoUrl: extraAudit.handoverPhotoUrl || targetReq.handoverPhotoUrl || null,
    };
    recordEmployeeAllocation({
      employeeId: targetReq.employeeId,
      employeeName: targetReq.employeeName,
      department: targetReq.department,
      role: targetReq.role,
      plant: targetReq.plant,
      allocation: allocItem,
    });

    triggerNotification(
      'Stock Dispensed Successfully',
      `1 unit of ${targetReq.itemName} handed over to ${targetReq.employeeName}. Active custody & employee allocation register updated.`,
      'success'
    );
  };

  // ── Level-1 Owner: tenant lifecycle & white-label branding ──────────────
  const toggleTenantModule = (tenantId, moduleId) => {
    const mod = MOCK_MODULES.find(m => m.id === moduleId);
    if (mod?.core) {
      triggerNotification('Core module', `“${mod.label}” is core and can't be switched off per tenant.`, 'warning');
      return;
    }
    let nowOn = false;
    setTenants(prev => prev.map(t => {
      if (t.id !== tenantId) return t;
      const has = t.modules.includes(moduleId);
      nowOn = !has;
      return { ...t, modules: has ? t.modules.filter(m => m !== moduleId) : [...t.modules, moduleId] };
    }));
    triggerNotification(
      'Feature flag updated',
      `Module “${mod?.label || moduleId}” ${nowOn ? 'enabled' : 'disabled'} for this tenant. Change is audit-logged.`,
      nowOn ? 'success' : 'info'
    );
  };

  const updateTenantBranding = (tenantId, patch) => {
    setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, branding: { ...t.branding, ...patch } } : t));
  };

  const provisionTenant = (name) => {
    const slug = (name || 'new-tenant').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const newTenant = {
      id: `T-${Math.floor(1000 + Math.random() * 9000)}`,
      name: name || 'New Tenant',
      domain: `${slug}.cageli-pep.com`,
      users: 1,
      plan: 'Trial',
      mrr: 0,
      state: 'setup',
      trial: true,
      modules: ['reporting'],
      branding: { accent: '#2563EB', ink: '#0B1220', ground: '#F3F4F6', logo: (name || 'N').charAt(0).toUpperCase() }
    };
    setTenants(prev => [...prev, newTenant]);
    setSelectedTenantId(newTenant.id);
    triggerNotification('Tenant provisioned', `“${newTenant.name}” created on ${newTenant.domain}. Onboarding invite sent.`, 'success');
    return newTenant;
  };

  // ── Level-2 Tenant Admin: scheduled report builder ──────────────────────
  const runScheduledReport = (reportName) => {
    triggerNotification(
      'Report generated',
      `“${reportName}” compiled → PDF + XLS. Delivered to mine manager, finance, SHEQ and posted to Teams.`,
      'success'
    );
  };

  const saveQuotation = (quote) => {
    setQuotations(prev => [quote, ...prev]);
    triggerNotification('Quotation Created', `Quotation ${quote.id} saved for ${quote.clientName}`, 'info');
  };

  const convertQuoteToInvoice = (quoteId) => {
    const q = quotations.find(item => item.id === quoteId);
    if (!q) return;

    const subtotal = q.items.reduce((acc, item) => acc + (item.unitPrice * item.qty), 0);
    const taxRate = q.taxEnabled === false ? 0 : 0.15;
    const vatAmount = subtotal * taxRate;
    const totalAmount = subtotal + vatAmount;

    const invoiceData = {
      invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
      quoteId: q.id,
      clientName: q.clientName,
      vatNumber: q.vatNumber,
      poNumber: q.poNumber,
      date: new Date().toISOString().substring(0, 10),
      dueDate: new Date(Date.now() + 30*24*60*60*1000).toISOString().substring(0, 10),
      items: q.items,
      subtotal,
      vatAmount,
      totalAmount,
      merchantName: "CageLi Safety Solutions (Pty) Ltd",
      merchantTagline: "PROTECT • PERFORM • DELIVER",
      merchantVat: "ZA4081928401",
      merchantBank: "First National Bank (FNB)",
      accountNumber: "62819402910",
      branchCode: "250655"
    };

    setSelectedInvoice(invoiceData);
    setQuotations(prev => prev.map(item => item.id === quoteId ? { ...item, status: 'CONVERTED_TO_INVOICE' } : item));
    triggerNotification('Invoice Generated', `B2B Tax Invoice ${invoiceData.invoiceNumber} created!`, 'success');
  };

  // Builds a tax invoice from a live Medusa draft order (same merchant details
  // and layout as the quote path). Used by the B2B portal in live mode.
  const convertOrderToInvoice = (order) => {
    const rawItems = (order.items && order.items.length > 0) ? order.items : [];
    const items = rawItems.map(i => {
      const prod = products.find(p => p.sku === i.sku || (i.name && p.name.toLowerCase() === i.name.toLowerCase()));
      const rawQty = Number(i.qty);
      const qty = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 1;
      const rawPrice = Number(i.unitPrice);
      const unitPrice = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : (prod?.sellingPrice ?? 0);
      return {
        sku: i.sku || prod?.sku || 'PPE-ITEM',
        name: i.name || prod?.name || 'Safety Equipment',
        qty,
        unitPrice,
      };
    });
    const subtotal = items.length > 0
      ? items.reduce((acc, item) => acc + (item.unitPrice * item.qty), 0)
      : (typeof order.subtotal === 'number' && order.subtotal > 0 ? order.subtotal : (typeof order.total === 'number' ? order.total : 0));
    const taxRate = order.taxEnabled === false ? 0 : 0.15;
    const vatAmount = subtotal * taxRate;
    const invoiceData = {
      invoiceNumber: order.displayId ? `INV-${order.displayId}` : `INV-${Date.now().toString().slice(-6)}`,
      clientName: order.clientName || order.email || 'Customer',
      vatNumber: order.vatNumber || '—',
      poNumber: order.poNumber || '—',
      date: new Date().toISOString().substring(0, 10),
      dueDate: new Date(Date.now() + 30*24*60*60*1000).toISOString().substring(0, 10),
      items: items.length > 0 ? items : [{ sku: 'PPE-BULK', name: 'Commercial Safety Equipment Order', qty: 1, unitPrice: subtotal }],
      subtotal,
      vatAmount,
      totalAmount: subtotal + vatAmount,
      merchantName: "CageLi Safety Solutions (Pty) Ltd",
      merchantTagline: "PROTECT • PERFORM • DELIVER",
      merchantVat: "ZA4081928401",
      merchantBank: "First National Bank (FNB)",
      accountNumber: "62819402910",
      branchCode: "250655"
    };
    setSelectedInvoice(invoiceData);
    triggerNotification('Invoice Generated', `B2B Tax Invoice ${invoiceData.invoiceNumber} created!`, 'success');
  };

  const receiveStockDirectly = (lines) => {
    if (!lines || !lines.length) return;
    setProducts((prev) => prev.map((p) => {
      const matched = lines.find((l) => l.sku === p.sku || (l.name && p.name?.toLowerCase() === l.name?.toLowerCase()));
      if (matched) {
        const qty = Number(matched.qty ?? matched.quantity ?? 1);
        return {
          ...p,
          stockOnHand: (p.stockOnHand ?? 0) + (isNaN(qty) ? 1 : qty),
        };
      }
      return p;
    }));
  };

  return (
    <AppContext.Provider value={{
      theme,
      toggleTheme,
      products,
      setProducts,
      receiveStockDirectly,
      catalogue,
      profitability,
      activePlant,
      setActivePlant,
      activeRole,
      setActiveRole,
      activeEmployee,
      setActiveEmployee,
      requests,
      quotations,
      selectedInvoice,
      setSelectedInvoice,
      taxEnabled,
      setTaxEnabled,
      pushNotification,
      triggerNotification,
      createRequest,
      entitlementRules,
      addEntitlementRule,
      removeEntitlementRule,
      approveRequest,
      rejectRequest,
      issueStockAndDeduct,
      saveQuotation,
      convertQuoteToInvoice,
      convertOrderToInvoice,
      plants: MOCK_PLANTS,
      tenants,
      selectedTenantId,
      setSelectedTenantId,
      toggleTenantModule,
      updateTenantBranding,
      provisionTenant,
      runScheduledReport,
      modules: MOCK_MODULES,
      employees: MOCK_EMPLOYEES,
      employeeAllocations,
      recordEmployeeAllocation,
      auth,
      tenantAccess,
      integrationMode: tenantAccess.mode,
      canManageCommerce,
      refreshCatalogue,
      orderStatusOverrides,
      setOrderStatusOverride
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
