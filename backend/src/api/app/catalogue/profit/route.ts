import type { MedusaResponse } from '@medusajs/framework/http';
import { buildProfitContract } from '../../../../catalogue/contract';
import { CatalogueConfigurationError, readCatalogueData } from '../../../../catalogue/read';
import { assertCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';

export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.manage', true);
    const data = await readCatalogueData(req, scope, true);
    res.json(buildProfitContract(data.products, data.inventoryLevels, data.context));
  } catch (error) {
    if (error instanceof ScopeError) {
      res.status(error.status).json({ code: error.code, message: error.message });
      return;
    }
    if (error instanceof CatalogueConfigurationError) {
      res.status(409).json({ code: error.code, message: error.message });
      return;
    }
    throw error;
  }
}
