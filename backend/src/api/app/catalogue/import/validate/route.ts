import type { MedusaResponse } from '@medusajs/framework/http';
import { validateProductImportCsv } from '../../../../../catalogue/csv-import';
import { assertCapability, ScopeError } from '../../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../../middlewares/tenant-scope';

type ValidationRequest = TenantScopedRequest & { body?: { csv?: unknown } };

export async function POST(req: ValidationRequest, res: MedusaResponse): Promise<void> {
  try {
    if (!req.tenantScope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(req.tenantScope, 'commerce.manage', true);
  } catch (error) {
    const scoped = error instanceof ScopeError ? error : new ScopeError(403, 'access_denied', 'Import validation access was denied.');
    res.status(scoped.status).json({ code: scoped.code, message: scoped.message });
    return;
  }

  if (typeof req.body?.csv !== 'string') {
    res.status(400).json({ code: 'csv_required', message: 'Request body must contain a CSV string.' });
    return;
  }
  res.json(validateProductImportCsv(req.body.csv));
}
