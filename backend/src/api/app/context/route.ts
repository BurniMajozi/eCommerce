import type { MedusaResponse } from '@medusajs/framework/http';
import type { TenantScopedRequest } from '../../middlewares/tenant-scope';

// This endpoint proves that authentication and tenant scope were resolved on
// the server. It intentionally exposes no secrets or unrestricted membership data.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  res.json({
    user_id: scope?.userId,
    tenant_id: scope?.tenantId,
    site_id: scope?.siteId,
    roles: scope?.roles ?? [],
    capabilities: scope?.capabilities ?? [],
    assurance_level: scope?.assuranceLevel,
  });
}
