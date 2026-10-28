import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { assertAnyCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';
import { ESCALATE_CAPS } from '../../approvals/caps';

const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;

// POST /app/notifications/read-all — mark all of MY unread notifications read.
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, ESCALATE_CAPS);
    const updated = await pg(req)('notifications')
      .where({ tenant_id: scope.tenantId, recipient_user_id: scope.userId })
      .whereNull('read_at')
      .update({ read_at: new Date().toISOString() });
    res.json({ updated: Number(updated) || 0 });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'notifications_read_all_failed', message: (error as Error).message });
  }
}
