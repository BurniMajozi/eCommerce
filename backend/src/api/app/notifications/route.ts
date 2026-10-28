import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { assertAnyCapability, ScopeError } from '../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../middlewares/tenant-scope';
import { ESCALATE_CAPS } from '../approvals/caps';
import { toApiNotification } from './emit';

const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;

// GET /app/notifications — the current user's own notifications (fan-out rows),
// newest first, plus an unread count for the topbar bell. Any provisioned member
// may read their own; the rows are always scoped to recipient = the caller.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, ESCALATE_CAPS);
    if (!scope.userId) throw new ScopeError(401, 'user_missing', 'No user in scope.');
    const db = pg(req);
    const base = () => db('notifications').where({ tenant_id: scope.tenantId, recipient_user_id: scope.userId });

    const limit = Math.min(100, Math.max(1, Math.floor(Number((req.query as any)?.limit)) || 30));
    let q = base().orderBy('created_at', 'desc').limit(limit);
    if (String((req.query as any)?.unread) === 'true') q = q.whereNull('read_at');
    const rows = await q;
    const unreadRow = await base().whereNull('read_at').count({ c: '*' }).first();
    const unreadCount = Number(unreadRow?.c ?? 0);
    res.json({ notifications: rows.map(toApiNotification), unreadCount });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'notifications_read_failed', message: (error as Error).message });
  }
}
