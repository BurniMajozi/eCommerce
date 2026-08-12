import type { MedusaResponse } from '@medusajs/framework/http';
import { PRODUCT_IMPORT_TEMPLATE } from '../../../../../catalogue/csv-import';
import { assertCapability, ScopeError } from '../../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../../middlewares/tenant-scope';

export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  try {
    if (!req.tenantScope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(req.tenantScope, 'commerce.manage', true);
  } catch (error) {
    const scoped = error instanceof ScopeError ? error : new ScopeError(403, 'access_denied', 'Import template access was denied.');
    res.status(scoped.status).json({ code: scoped.code, message: scoped.message });
    return;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sightlive-product-import-template.csv"');
  res.send(PRODUCT_IMPORT_TEMPLATE);
}
