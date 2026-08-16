import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { WorkflowManager } from '@medusajs/framework/orchestration';
import { assertCapability, ScopeError } from '../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../middlewares/tenant-scope';

// GET /app/engine — live view of the Medusa workflow engine and event bus:
// registered workflows, recent workflow executions (real state), and the
// module/event registration the engine actually loaded. commerce.read gated.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.read');

    // Registered workflow definitions from the live orchestrator.
    let workflows: Array<{ id: string; steps: number; async: boolean; store: boolean }> = [];
    try {
      const defs = (WorkflowManager as { getWorkflows: () => Map<string, any> }).getWorkflows();
      workflows = [...defs.entries()].map(([id, def]) => {
        const opts = def?.options ?? {};
        const stepCount = def?.handlers_ instanceof Map ? def.handlers_.size : 0;
        return { id, steps: stepCount, async: !!opts.async, store: !!opts.store };
      }).sort((a, b) => a.id.localeCompare(b.id));
    } catch { /* orchestrator not ready */ }

    // Recent workflow executions (real run history, durable/async workflows).
    let executions: Array<Record<string, any>> = [];
    let executionsTotal = 0;
    try {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      const { data, metadata } = await query.graph({
        entity: 'workflow_execution',
        fields: ['id', 'workflow_id', 'transaction_id', 'state', 'created_at', 'updated_at'],
        pagination: { skip: 0, take: 25, order: { updated_at: 'DESC' } },
      } as Parameters<typeof query.graph>[0]);
      executions = (data ?? []).map((e: Record<string, any>) => ({
        workflowId: e.workflow_id,
        transactionId: e.transaction_id,
        state: e.state,
        createdAt: e.created_at,
        updatedAt: e.updated_at,
      }));
      executionsTotal = (metadata as { count?: number } | undefined)?.count ?? executions.length;
    } catch { /* execution table empty or unavailable */ }

    res.json({
      source: 'medusa',
      workflowCount: workflows.length,
      workflows: workflows.slice(0, 60),
      executions,
      executionsTotal,
    });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'engine_read_failed', message: (error as Error).message });
  }
}
