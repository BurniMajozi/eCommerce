import type { MedusaResponse } from '@medusajs/framework/http';
import { assertCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';
import { ppeIssueSagaWorkflow } from '../../../../workflows/ppe-issue-saga';

// POST /app/engine/run — execute the PPE issue saga workflow live on the tenant's
// backend and return the real transaction id + terminal state. Pass {fail:true}
// to trigger the downstream failure and watch the saga compensate in reverse.
// Gated commerce.manage (DB-flagged requires_mfa → step-up enforced).
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.manage');

    const body = (req.body ?? {}) as { quantity?: number; sku?: string; fail?: boolean };
    const quantity = Number.isFinite(body.quantity) ? Number(body.quantity) : 5;
    const input = { quantity, sku: body.sku || 'DROMEX-BOOT', fail: !!body.fail };

    // throwOnError:false so a compensated (failed) run returns its state
    // instead of throwing — we report the real outcome either way.
    const { result, transaction, errors } = await ppeIssueSagaWorkflow(req.scope).run({
      input,
      throwOnError: false,
    });

    const tx = transaction as { transactionId?: string; getFlow?: () => { state?: string } } | undefined;
    const state = tx?.getFlow?.().state ?? (errors && errors.length ? 'reverted' : 'done');

    res.json({
      ran: true,
      workflowId: 'ppe-issue-saga',
      transactionId: tx?.transactionId ?? null,
      state,
      input,
      result: result ?? null,
      errors: (errors ?? []).map((e: any) => (e?.error?.message || String(e?.error || e)).slice(0, 200)),
    });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'engine_run_failed', message: (error as Error).message });
  }
}
