const rawBaseUrl = import.meta.env.VITE_MEDUSA_BASE_URL?.trim();

const validBaseUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
  } catch {
    return false;
  }
};

export const isMedusaCatalogueEnabled = import.meta.env.VITE_DEMO_MODE !== 'true'
  && import.meta.env.VITE_MEDUSA_CATALOGUE_ENABLED === 'true'
  && validBaseUrl(rawBaseUrl);

export class CatalogueApiError extends Error {
  constructor(message, { status = 0, code = 'catalogue_unavailable' } = {}) {
    super(message);
    this.name = 'CatalogueApiError';
    this.status = status;
    this.code = code;
  }
}

// In-memory SWR (Stale-While-Revalidate) Cache for sub-second page switches
const cache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export const invalidateCache = (prefix = '') => {
  if (!prefix) { cache.clear(); return; }
  for (const key of cache.keys()) {
    if (key.includes(prefix)) cache.delete(key);
  }
};

export async function fetchCatalogue({ accessToken, tenantId, siteId = null, signal, forceRefresh = false } = {}) {
  if (!isMedusaCatalogueEnabled) throw new CatalogueApiError('Medusa catalogue reads are not enabled; the app remains in demo mode.');
  if (!accessToken || !tenantId) throw new CatalogueApiError('An authenticated tenant scope is required.', { status: 401, code: 'scope_required' });

  const cacheKey = `catalogue:${tenantId}:${siteId || 'all'}`;
  const hit = cache.get(cacheKey);
  const now = Date.now();

  if (!forceRefresh && hit && now - hit.ts < CACHE_TTL_MS) {
    return hit.data;
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'X-Tenant-ID': tenantId,
  };
  if (siteId) headers['X-Site-ID'] = siteId;

  let response;
  try {
    response = await fetch(new URL('/app/catalogue', rawBaseUrl), { headers, signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    if (hit) return hit.data; // graceful fallback to warm cache
    throw new CatalogueApiError('The Medusa catalogue service could not be reached.');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (hit) return hit.data;
    throw new CatalogueApiError(payload.message ?? 'The Medusa catalogue request failed.', {
      status: response.status,
      code: payload.code,
    });
  }
  if (!Array.isArray(payload.items)) {
    throw new CatalogueApiError('The Medusa catalogue response did not match the expected contract.', {
      status: response.status,
      code: 'invalid_catalogue_contract',
    });
  }

  cache.set(cacheKey, { ts: now, data: payload });
  return payload;
}

const scopedHeaders = (accessToken, tenantId, siteId = null) => {
  if (!accessToken || !tenantId) throw new CatalogueApiError('An authenticated tenant scope is required.', { status: 401, code: 'scope_required' });
  const headers = { Authorization: `Bearer ${accessToken}`, 'X-Tenant-ID': tenantId };
  if (siteId) headers['X-Site-ID'] = siteId;
  return headers;
};

async function scopedJson(path, { accessToken, tenantId, siteId = null, signal, method = 'GET', body, forceRefresh = false } = {}) {
  if (!isMedusaCatalogueEnabled) throw new CatalogueApiError('Medusa catalogue reads are not enabled; the app remains in demo mode.');

  const isGet = method === 'GET';
  const cacheKey = `${path}:${tenantId}:${siteId || 'all'}`;
  const now = Date.now();

  if (isGet && !forceRefresh) {
    const hit = cache.get(cacheKey);
    if (hit && now - hit.ts < CACHE_TTL_MS) {
      return hit.data;
    }
  }

  const headers = scopedHeaders(accessToken, tenantId, siteId);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(new URL(path, rawBaseUrl), { method, headers, signal, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    if (isGet && cache.has(cacheKey)) return cache.get(cacheKey).data;
    throw new CatalogueApiError('The Medusa catalogue service could not be reached.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (isGet && cache.has(cacheKey)) return cache.get(cacheKey).data;
    // A protected WRITE hit the authenticator (aal2) wall — ask the app to prompt
    // for step-up. Reads never trigger the popup (so it can't fire on a
    // background fetch / page load); the action can be retried once elevated.
    if (payload.code === 'mfa_required' && !isGet && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sightlive:mfa-required'));
    }
    throw new CatalogueApiError(payload.message ?? 'The Medusa request failed.', { status: response.status, code: payload.code });
  }

  if (isGet) {
    cache.set(cacheKey, { ts: now, data: payload });
  } else {
    // Invalidate relevant cache on writes
    if (path.includes('/parties')) invalidateCache('/app/commerce/parties');
    if (path.includes('/purchase-orders') || path.includes('/orders')) {
      invalidateCache('/app/commerce/purchase-orders');
      invalidateCache('/app/orders');
      invalidateCache('catalogue:');
      invalidateCache('/app/catalogue');
      invalidateCache('/app/catalogue/profit');
      invalidateCache('/app/reports/summary');
    }
    if (path.includes('/promotions')) invalidateCache('/app/commerce/promotions');
    if (path.includes('/members')) invalidateCache('/app/members');
    if (path.includes('/products')) {
      invalidateCache('catalogue:');
      invalidateCache('/app/catalogue');
    }
  }

  return payload;
}

export const fetchProfitability = (scope) => scopedJson('/app/catalogue/profit', scope);
export const fetchReports = (scope) => scopedJson('/app/reports/summary', scope);
export const fetchCommerceConfig = (scope) => scopedJson('/app/commerce/config', scope);

// Platform Owner panel — service-role reads/writes (no browser RLS needed).
export const fetchPlatformOverview = (scope) => scopedJson('/app/platform/overview', scope);
export const provisionPlatformTenant = (body, scope) => scopedJson('/app/platform/tenants', { ...scope, method: 'POST', body });
export const updatePlatformTenant = (id, patch, scope) => scopedJson(`/app/platform/tenants/${id}`, { ...scope, method: 'PATCH', body: patch });
export const fetchParties = (scope) => scopedJson('/app/commerce/parties', scope);

export const createParty = (party, scope) => scopedJson('/app/commerce/parties', {
  ...scope, method: 'POST', body: party,
});

export const updateParty = (id, patch, scope) => scopedJson(`/app/commerce/parties/${id}`, {
  ...scope, method: 'PATCH', body: patch,
});

export const deleteParty = (id, scope) => scopedJson(`/app/commerce/parties/${id}`, {
  ...scope, method: 'DELETE',
});

export const fetchPurchaseOrders = (scope) => scopedJson('/app/commerce/purchase-orders', scope);

export const createPurchaseOrder = (po, scope) => scopedJson('/app/commerce/purchase-orders', {
  ...scope, method: 'POST', body: po,
});

export const updatePurchaseOrder = (id, patch, scope) => scopedJson(`/app/commerce/purchase-orders/${id}`, {
  ...scope, method: 'PATCH', body: patch,
});

export const updateOrder = (id, patch, scope) => scopedJson(`/app/orders/${id}`, {
  ...scope, method: 'PATCH', body: patch,
});

export const deletePurchaseOrder = (id, scope) => scopedJson(`/app/commerce/purchase-orders/${id}`, {
  ...scope, method: 'DELETE',
});

export const fetchEngine = (scope) => scopedJson('/app/engine', scope);

// Contractor Store: retail PPE purchase → Paystack → pickup at the store.
export const storeCheckout = (payload, scope) => scopedJson('/app/store/checkout', { ...scope, method: 'POST', body: payload });
export const storeVerify = (reference, scope) => scopedJson(`/app/store/verify?reference=${encodeURIComponent(reference)}`, scope);
export const fetchStoreOrders = (scope) => scopedJson('/app/store/orders', scope);
export const collectStoreOrder = (id, pickupCode, scope) => scopedJson(`/app/store/orders/${id}`, { ...scope, method: 'PATCH', body: { pickupCode } });

// White-label: the caller's own active-tenant branding (accent + signed logo URL).
export const fetchBranding = (scope) => scopedJson('/app/branding', scope);

// Legacy first-login marker retained only for older deployed clients. Current
// clients use the same email-code flow for every address and never query status.
export async function markLoginBootstrapped(accessToken) {
  if (!isMedusaCatalogueEnabled || !rawBaseUrl || !accessToken) return;
  try {
    await fetch(new URL('/session/bootstrapped', rawBaseUrl), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    });
  } catch { /* best-effort — worst case they get the password prompt once more */ }
}

// In-app bug reporting. Any member can report; platform owners list + triage.
export const reportBug = (payload, scope) => scopedJson('/app/bugs', { ...scope, method: 'POST', body: payload });
export const fetchBugs = (scope, status) => scopedJson(`/app/bugs${status ? `?status=${encodeURIComponent(status)}` : ''}`, scope);
export const updateBug = (id, patch, scope) => scopedJson(`/app/bugs/${id}`, { ...scope, method: 'PATCH', body: patch });

// Sites / locations under a tenant (owner-managed).
export const fetchTenantSites = (tenantId, scope) => scopedJson(`/app/platform/tenants/${tenantId}/sites`, scope);
export const createTenantSite = (tenantId, body, scope) => scopedJson(`/app/platform/tenants/${tenantId}/sites`, { ...scope, method: 'POST', body });
export const updateTenantSite = (tenantId, siteId, patch, scope) => scopedJson(`/app/platform/tenants/${tenantId}/sites/${siteId}`, { ...scope, method: 'PATCH', body: patch });

// Platform subscription billing (owner): metered charges → invoice → Paystack.
export const fetchBilling = (scope) => scopedJson('/app/platform/billing', scope);
export const issueInvoice = (tenantId, period, scope) => scopedJson('/app/platform/billing/invoices', { ...scope, method: 'POST', body: { tenantId, period } });
export const chargeInvoice = (id, payerEmail, scope) => scopedJson(`/app/platform/billing/invoices/${id}`, { ...scope, method: 'POST', body: { action: 'charge', payerEmail } });
export const verifyInvoice = (id, reference, scope) => scopedJson(`/app/platform/billing/invoices/${id}`, { ...scope, method: 'POST', body: { action: 'verify', reference } });

// Record-bound transactional email. The browser sends only a record id; the
// backend resolves the tenant-owned recipient and trusted template data.
export async function sendNotificationEmail(template, recordId, scope) {
  try {
    return await scopedJson('/app/notifications/email', { ...scope, method: 'POST', body: { template, recordId } });
  } catch (e) {
    return { sent: false, error: e?.message || 'email failed' };
  }
}

export const runEngineWorkflow = (body, scope) => scopedJson('/app/engine/run', {
  ...scope,
  method: 'POST',
  body,
});

export const uploadProductImage = ({ sku, filename, contentType, dataBase64 }, scope) => scopedJson('/app/products/image', {
  ...scope,
  method: 'POST',
  body: { sku, filename, contentType, dataBase64 },
});

export const createProduct = (product, scope) => scopedJson('/app/products', {
  ...scope,
  method: 'POST',
  body: product,
});

export const updateProduct = (id, patch, scope) => scopedJson(`/app/products/${id}`, {
  ...scope,
  method: 'PATCH',
  body: patch,
});

export const deleteProduct = (id, scope) => scopedJson(`/app/products/${id}`, {
  ...scope,
  method: 'DELETE',
});

export const fetchOrders = (scope) => scopedJson('/app/orders', scope);
export const fetchPromotions = (scope) => scopedJson('/app/commerce/promotions', scope);

export const createPromotion = (promo, scope) => scopedJson('/app/commerce/promotions', {
  ...scope, method: 'POST', body: promo,
});

export const updatePromotion = (id, patch, scope) => scopedJson(`/app/commerce/promotions/${id}`, {
  ...scope, method: 'PATCH', body: patch,
});

export const deletePromotion = (id, scope) => scopedJson(`/app/commerce/promotions/${id}`, {
  ...scope, method: 'DELETE',
});

export const createOrder = (order, scope) => scopedJson('/app/orders', {
  ...scope,
  method: 'POST',
  body: order,
});

export const fetchMembers = (scope) => scopedJson('/app/members', scope);

export const inviteMember = (member, scope) => scopedJson('/app/members', {
  ...scope,
  method: 'POST',
  body: member,
});

export const updateMemberRole = (membershipId, role, scope) => scopedJson(`/app/members/${membershipId}`, {
  ...scope,
  method: 'PATCH',
  body: { role },
});

export const removeMember = (membershipId, scope) => scopedJson(`/app/members/${membershipId}`, {
  ...scope,
  method: 'DELETE',
});

export const fetchImportStatus = (scope) => scopedJson('/app/catalogue/import/status', scope);

export const validateProductImport = (csv, scope) => scopedJson('/app/catalogue/import/validate', {
  ...scope,
  method: 'POST',
  body: { csv },
});

export async function downloadProductImportTemplate({ accessToken, tenantId, siteId = null } = {}) {
  if (!isMedusaCatalogueEnabled) throw new CatalogueApiError('Medusa catalogue reads are not enabled; the app remains in demo mode.');
  const response = await fetch(new URL('/app/catalogue/import/template', rawBaseUrl), {
    headers: scopedHeaders(accessToken, tenantId, siteId),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new CatalogueApiError(payload.message ?? 'The template could not be downloaded.', { status: response.status, code: payload.code });
  }
  return response.blob();
}
