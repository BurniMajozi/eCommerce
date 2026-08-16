import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { assertCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';

// GET /app/commerce/config — live data for the Promotions, Tax, Fulfilment and
// Customers admin screens, read straight from the Medusa modules. Tenant-scoped,
// commerce.read. Shapes are normalised to what the admin UI renders.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.read');

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const graph = async (entity: string, fields: string[]) => {
      try {
        const { data } = await query.graph({ entity, fields, pagination: { skip: 0, take: 200 } } as Parameters<typeof query.graph>[0]);
        return (data ?? []) as Array<Record<string, any>>;
      } catch { return []; }
    };

    const [promos, taxRegions, customers, providers] = await Promise.all([
      graph('promotion', ['id', 'code', 'status', 'is_automatic', 'application_method.type', 'application_method.value', 'application_method.target_type', 'application_method.currency_code']),
      graph('tax_region', ['id', 'country_code', 'province_code', 'tax_rates.rate', 'tax_rates.name', 'tax_rates.code', 'tax_rates.is_default']),
      graph('customer', ['id', 'email', 'company_name', 'first_name', 'last_name', 'has_account']),
      graph('fulfillment_provider', ['id', 'is_enabled']),
    ]);

    const promotions = promos.map((p) => {
      const am = p.application_method || {};
      const isPct = am.type === 'percentage';
      return {
        code: p.code,
        type: isPct ? 'Percentage' : (am.type === 'fixed' ? 'Fixed' : (p.type || 'Promotion')),
        value: am.value != null ? (isPct ? `${am.value}% off` : `${am.currency_code ? am.currency_code.toUpperCase() + ' ' : 'R'}${am.value} off`) : '—',
        applies: am.target_type ? String(am.target_type).replace(/_/g, ' ') : (p.is_automatic ? 'automatic' : 'code'),
        status: p.status || 'draft',
        used: 0,
      };
    });

    const taxRegionsOut = taxRegions.map((t) => {
      const rate = (t.tax_rates || []).find((r: any) => r.is_default) || (t.tax_rates || [])[0] || {};
      return {
        region: (t.country_code || '').toUpperCase(),
        code: (t.country_code || '').toUpperCase(),
        rate: rate.rate ?? 0,
        name: rate.name || 'VAT',
        default: !!rate.is_default,
      };
    });

    const customersOut = customers.map((c) => ({
      id: c.id,
      company: c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Customer',
      email: c.email || null,
      buyers: 1,
      currency: 'ZAR',
      limit: null,
      spent: null,
      taxExempt: false,
    }));

    const fulfilment = providers.map((p) => ({
      provider: String(p.id).replace(/_/g, ' '),
      regions: 'All sites',
      rate: 'quoted',
      eta: '—',
      enabled: !!p.is_enabled,
    }));

    res.json({ source: 'medusa', promotions, taxRegions: taxRegionsOut, customers: customersOut, fulfilment });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    throw error;
  }
}
