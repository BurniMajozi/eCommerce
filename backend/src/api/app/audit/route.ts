import type { MedusaResponse } from '@medusajs/framework/http';
import { assertCapability, ScopeError } from '../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../middlewares/tenant-scope';
import { getServiceClient } from '../../../security/supabase-scope-resolver';

// GET /app/audit — the tenant's audit trail (who did what). Gated on audit.read,
// which is flagged requires_mfa, so an aal2 (authenticator) session is required.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'audit.read'); // requires_mfa on the capability enforces aal2
    const db = getServiceClient();
    const { data, error } = await db
      .from('audit_events')
      .select('id, action, target_type, target_id, source, actor_type, actor_user_id, metadata, created_at')
      .eq('tenant_id', scope.tenantId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    res.json({
      events: (data ?? []).map((e: any) => ({
        id: e.id, action: e.action, targetType: e.target_type, targetId: e.target_id,
        source: e.source, actorType: e.actor_type, actor: e.actor_user_id,
        at: e.created_at, metadata: e.metadata ?? {},
      })),
    });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'audit_failed', message: (error as Error).message });
  }
}
