import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { assertCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';

const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
const STATUSES = ['open', 'triaged', 'in_progress', 'closed'];

// PATCH /app/bugs/:id — platform-owner triage: change status / add a resolution.
export async function PATCH(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'platform.manage');
    const b = (req.body ?? {}) as { status?: string; resolution?: string };
    const patch: Record<string, any> = { updated_at: new Date() };
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) throw new ScopeError(400, 'invalid_status', `Status must be one of: ${STATUSES.join(', ')}.`);
      patch.status = b.status;
    }
    if (b.resolution !== undefined) patch.resolution = b.resolution.toString().slice(0, 2000);

    const n = await pg(req)('bug_reports').where({ id: req.params.id }).update(patch);
    if (!n) throw new ScopeError(404, 'bug_not_found', 'Bug report not found.');
    res.json({ id: req.params.id, ok: true, status: patch.status ?? null });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'bug_update_failed', message: (error as Error).message });
  }
}
