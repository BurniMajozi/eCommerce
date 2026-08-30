import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { assertCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';
import { getServiceClient } from '../../../../security/supabase-scope-resolver';
import { computeCharge, currentPeriod, invoiceToApi } from '../../../../lib/billing';

const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;

// GET /app/platform/billing — for every tenant, the live seat count and the
// metered charge for their plan, plus this period's invoice (if issued) and the
// recent invoice history. Platform-owner only.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'platform.manage');
    const db = getServiceClient();

    const { data: tenants } = await db.from('tenants').select('id, name, plan_key, status');
    const { data: mems } = await db.from('memberships').select('tenant_id').eq('status', 'active');
    const seatByTenant = new Map<string, number>();
    for (const m of (mems ?? []) as any[]) seatByTenant.set(m.tenant_id, (seatByTenant.get(m.tenant_id) || 0) + 1);

    const period = currentPeriod();
    let invoiceRows: any[] = [];
    try { invoiceRows = await pg(req)('platform_invoices').orderBy('issued_at', 'desc').limit(300); } catch { invoiceRows = []; }
    const byKey = new Map<string, any>();
    for (const iv of invoiceRows) byKey.set(`${iv.tenant_id}|${iv.period}`, iv);

    const rows = ((tenants ?? []) as any[]).map((t) => {
      const seats = seatByTenant.get(t.id) || 0;
      const charge = computeCharge(t.plan_key, seats);
      const inv = byKey.get(`${t.id}|${period}`);
      return { id: t.id, name: t.name, plan: charge.plan, status: t.status, seats, charge, currentInvoice: inv ? invoiceToApi(inv) : null };
    });

    const mrr = rows.reduce((a, r) => a + (r.charge.total || 0), 0);
    res.json({ period, mrr, tenants: rows, invoices: invoiceRows.map(invoiceToApi) });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'billing_failed', message: (error as Error).message });
  }
}
