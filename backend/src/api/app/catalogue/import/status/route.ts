import type { MedusaResponse } from '@medusajs/framework/http';
import { PRODUCT_IMPORT_COLUMNS, PRODUCT_IMPORT_MAX_BYTES, PRODUCT_IMPORT_MAX_ROWS } from '../../../../../catalogue/csv-import';
import { assertCapability, ScopeError } from '../../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../../middlewares/tenant-scope';

export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  try {
    if (!req.tenantScope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(req.tenantScope, 'commerce.manage', true);
  } catch (error) {
    const scoped = error instanceof ScopeError ? error : new ScopeError(403, 'access_denied', 'Import status access was denied.');
    res.status(scoped.status).json({ code: scoped.code, message: scoped.message });
    return;
  }
  res.json({
    mode: 'validation_only',
    writes_enabled: false,
    accepted_type: 'text/csv',
    max_bytes: PRODUCT_IMPORT_MAX_BYTES,
    max_rows: PRODUCT_IMPORT_MAX_ROWS,
    columns: PRODUCT_IMPORT_COLUMNS,
  });
}
