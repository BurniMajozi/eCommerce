import React, { createContext, useContext, useState, useEffect } from 'react';
import { CAGELI_PRODUCTS, MOCK_EMPLOYEES, MOCK_REQUESTS, MOCK_QUOTATIONS, MOCK_PLANTS, MOCK_TENANTS, MOCK_MODULES } from '../data/mockData';
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
  const [requests, setRequests] = useState(MOCK_REQUESTS);
  const [quotations, setQuotations] = useState(MOCK_QUOTATIONS);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [pushNotification, setPushNotification] = useState(null);
  const [taxEnabled, setTaxEnabled] = useState(true); // merchant setting: add VAT to quotes/invoices

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
        setProducts(response.items);
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
  }, [auth.session?.access_token, tenantAccess.activeTenantId, tenantAccess.activeSiteId]);

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
  }, [auth.session?.access_token, tenantAccess.activeTenantId, tenantAccess.activeSiteId, canManageCommerce]);

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

  const issueStockAndDeduct = (reqId) => {
    const targetReq = requests.find(r => r.id === reqId);
    if (!targetReq) return;

    // Deduct stock
    setProducts(prev => prev.map(p => p.sku === targetReq.sku ? { ...p, stockOnHand: Math.max(0, p.stockOnHand - 1) } : p));
    
    // Mark request fulfilled
    setRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'FULFILLED_DISPATCHED' } : r));

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

    triggerNotification(
      'Stock Dispensed Successfully',
      `1 unit of ${targetReq.itemName} handed over to ${targetReq.employeeName}. Active custody register updated.`,
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

  return (
    <AppContext.Provider value={{
      theme,
      toggleTheme,
      products,
      catalogue,
      profitability,
      activePlant,
      setActivePlant,
      activeRole,
      setActiveRole,
      activeEmployee,
      requests,
      quotations,
      selectedInvoice,
      setSelectedInvoice,
      taxEnabled,
      setTaxEnabled,
      pushNotification,
      triggerNotification,
      createRequest,
      approveRequest,
      rejectRequest,
      issueStockAndDeduct,
      saveQuotation,
      convertQuoteToInvoice,
      plants: MOCK_PLANTS,
      tenants,
      selectedTenantId,
      setSelectedTenantId,
      toggleTenantModule,
      updateTenantBranding,
      provisionTenant,
      runScheduledReport,
      modules: MOCK_MODULES,
      // Phase 1 integration state. Existing UI actions intentionally continue
      // to use local mock state until their Medusa workflows are implemented.
      auth,
      tenantAccess,
      integrationMode: tenantAccess.mode
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
