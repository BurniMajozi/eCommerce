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

export async function fetchCatalogue({ accessToken, tenantId, siteId = null, signal } = {}) {
  if (!isMedusaCatalogueEnabled) throw new CatalogueApiError('Medusa catalogue reads are not enabled; the app remains in demo mode.');
  if (!accessToken || !tenantId) throw new CatalogueApiError('An authenticated tenant scope is required.', { status: 401, code: 'scope_required' });

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
    throw new CatalogueApiError('The Medusa catalogue service could not be reached.');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
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
  return payload;
}

const scopedHeaders = (accessToken, tenantId, siteId = null) => {
  if (!accessToken || !tenantId) throw new CatalogueApiError('An authenticated tenant scope is required.', { status: 401, code: 'scope_required' });
  const headers = { Authorization: `Bearer ${accessToken}`, 'X-Tenant-ID': tenantId };
  if (siteId) headers['X-Site-ID'] = siteId;
  return headers;
};

async function scopedJson(path, { accessToken, tenantId, siteId = null, signal, method = 'GET', body } = {}) {
  if (!isMedusaCatalogueEnabled) throw new CatalogueApiError('Medusa catalogue reads are not enabled; the app remains in demo mode.');
  const headers = scopedHeaders(accessToken, tenantId, siteId);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(new URL(path, rawBaseUrl), { method, headers, signal, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new CatalogueApiError('The Medusa catalogue service could not be reached.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new CatalogueApiError(payload.message ?? 'The Medusa request failed.', { status: response.status, code: payload.code });
  return payload;
}

export const fetchProfitability = (scope) => scopedJson('/app/catalogue/profit', scope);

// Uploads a product photo (base64) and returns its public URL.
export const uploadProductImage = ({ sku, filename, contentType, dataBase64 }, scope) => scopedJson('/app/products/image', {
  ...scope,
  method: 'POST',
  body: { sku, filename, contentType, dataBase64 },
});

// Creates a product in the tenant's catalogue. `product` carries name, sku,
// category, cost/selling price, stock and (optionally) an imageUrl from a prior
// uploadProductImage call.
export const createProduct = (product, scope) => scopedJson('/app/products', {
  ...scope,
  method: 'POST',
  body: product,
});

// Edits an existing product (only the fields present in `patch` are changed).
export const updateProduct = (id, patch, scope) => scopedJson(`/app/products/${id}`, {
  ...scope,
  method: 'PATCH',
  body: patch,
});

// Removes a product from the catalogue.
export const deleteProduct = (id, scope) => scopedJson(`/app/products/${id}`, {
  ...scope,
  method: 'DELETE',
});

// Lists the tenant's B2B draft orders (quotes), newest first.
export const fetchOrders = (scope) => scopedJson('/app/orders', scope);

// Creates a real Medusa draft order from a B2B quote.
export const createOrder = (order, scope) => scopedJson('/app/orders', {
  ...scope,
  method: 'POST',
  body: order,
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
