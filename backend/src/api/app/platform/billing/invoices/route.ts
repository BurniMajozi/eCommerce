import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { randomUUID } from 'crypto';
import { assertCapability, ScopeError } from '../../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../../middlewares/tenant-scope';
import { getServiceClient } from '../../../../../security/supabase-scope-resolver';
import { computeCharge, currentPeriod, invoiceToApi } from '../../../../../lib/billing';

const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;

// POST /app/platform/billing/invoices — issue (or refresh) a subscription
// invoice for a tenant + period, priced from the plan and live seat count.
// Idempotent per (tenant, period): a paid invoice is returned untouched.
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'platform.manage');
    const b = (req.body ?? {}) as { tenantId?: string; period?: string };
    const tenantId = (b.tenantId ?? '').toString();
    if (!tenantId) throw new ScopeError(400, 'tenant_required', 'A tenantId is required.');
    const period = (b.period ?? '').toString().match(/^\d{4}-\d{2}$/) ? (b.period as string) : currentPeriod();

    const db = getServiceClient();
    const { data: t } = await db.from('tenants').select('id, name, plan_key').eq('id', tenantId).maybeSingle();
    if (!t) throw new ScopeError(404, 'tenant_not_found', 'Tenant not found.');
    const { count } = await db.from('memberships').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active');
    const seats = count || 0;
    const charge = computeCharge((t as any).plan_key, seats);

    const existing = await pg(req)('platform_invoices').where({ tenant_id: tenantId, period }).first();
    if (existing) {
      if (existing.status === 'paid') { res.json({ invoice: invoiceToApi(existing), existed: true }); return; }
      await pg(req)('platform_invoices').where({ id: existing.id }).update({
        plan: charge.plan, seats, base_amount: charge.base, seat_amount: charge.seatAmount, total: charge.total, updated_at: new Date(),
      });
      const fresh = await pg(req)('platform_invoices').where({ id: existing.id }).first();
      res.json({ invoice: invoiceToApi(fresh), existed: true });
      return;
    }

    const id = randomUUID();
    await pg(req)('platform_invoices').insert({
      id, tenant_id: tenantId, tenant_name: (t as any).name, period, plan: charge.plan, seats,
      base_amount: charge.base, seat_amount: charge.seatAmount, total: charge.total, currency: charge.currency, status: 'issued',
    });
    const row = await pg(req)('platform_invoices').where({ id }).first();
    res.status(201).json({ invoice: invoiceToApi(row) });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'invoice_failed', message: (error as Error).message });
  }
}
