import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { assertAnyCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';
import { ESCALATE_CAPS } from '../../approvals/caps';

const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;

// PATCH /app/notifications/:id — mark one of MY notifications read/unread.
export async function PATCH(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, ESCALATE_CAPS);
    const read = ((req.body as any)?.read ?? true) !== false;
    const n = await pg(req)('notifications')
      .where({ id: req.params.id, tenant_id: scope.tenantId, recipient_user_id: scope.userId })
      .update({ read_at: read ? new Date().toISOString() : null });
    if (!n) throw new ScopeError(404, 'notification_not_found', 'Notification not found.');
    res.json({ id: req.params.id, read });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'notification_update_failed', message: (error as Error).message });
  }
}
