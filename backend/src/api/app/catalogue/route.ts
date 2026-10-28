import type { MedusaResponse } from '@medusajs/framework/http';
import { buildCatalogueContract } from '../../../catalogue/contract';
import { CatalogueConfigurationError, readCatalogueData } from '../../../catalogue/read';
import { assertAnyCapability, ScopeError } from '../../../security/tenant-scope';
import { ESCALATE_CAPS } from '../approvals/caps';
import type { TenantScopedRequest } from '../../middlewares/tenant-scope';

export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    // Every member can browse the store catalogue (selling price + stock; cost stays private).
    assertAnyCapability(scope, ESCALATE_CAPS);
  } catch (error) {
    const scoped = error instanceof ScopeError ? error : new ScopeError(403, 'access_denied', 'Catalogue access was denied.');
    res.status(scoped.status).json({ code: scoped.code, message: scoped.message });
    return;
  }

  try {
    const data = await readCatalogueData(req, scope, false);
    res.json(buildCatalogueContract(data.products, data.inventoryLevels, data.context));
  } catch (error) {
    if (error instanceof CatalogueConfigurationError) {
      res.status(409).json({ code: error.code, message: error.message });
      return;
    }
    throw error;
  }
}
