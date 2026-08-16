import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { createCustomersWorkflow } from '@medusajs/medusa/core-flows';
import { assertCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';

// Commerce "parties" = trading partners, stored as Medusa customers split by
// metadata.party_type: 'customer' (internal B2B buyers, sell TO) and 'supplier'
// (external vendors, buy FROM). Both carry an editable spend/purchase limit in
// metadata.spend_limit. Customer spend is derived live from their orders.
type PartyType = 'customer' | 'supplier';
const num = (v: any): number | null => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));

function shape(c: Record<string, any>, spent: number | null) {
  const md = c.metadata || {};
  const type: PartyType = md.party_type === 'supplier' ? 'supplier' : 'customer';
  return {
    id: c.id,
    type,
    company: c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Party',
    email: c.email || null,
    currency: md.currency || 'ZAR',
    limit: num(md.spend_limit),
    spent: type === 'customer' ? spent : num(md.spend_used),
    taxExempt: md.tax_exempt === true || md.tax_exempt === 'true',
    category: md.category || null,
    leadTime: md.lead_time || null,
  };
}

// GET /app/commerce/parties — list customers + suppliers with live spend.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.read');
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

    const { data: customers } = await query.graph({
      entity: 'customer',
      fields: ['id', 'email', 'company_name', 'first_name', 'last_name', 'metadata'],
      pagination: { skip: 0, take: 200 },
    } as Parameters<typeof query.graph>[0]);

    // Live spend per customer from their orders.
    const spentByCustomer = new Map<string, number>();
    try {
      const { data: orders } = await query.graph({
        entity: 'order',
        fields: ['id', 'customer_id', 'total'],
        pagination: { skip: 0, take: 1000 },
      } as Parameters<typeof query.graph>[0]);
      for (const o of orders ?? []) {
        if (!o.customer_id) continue;
        spentByCustomer.set(o.customer_id, (spentByCustomer.get(o.customer_id) ?? 0) + Number(o.total ?? 0));
      }
    } catch { /* orders unavailable */ }

    const parties = (customers ?? []).map((c: Record<string, any>) => shape(c, spentByCustomer.get(c.id) ?? 0));
    res.json({
      source: 'medusa',
      customers: parties.filter((p) => p.type === 'customer'),
      suppliers: parties.filter((p) => p.type === 'supplier'),
    });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'parties_read_failed', message: (error as Error).message });
  }
}

// POST /app/commerce/parties — create a customer or supplier.
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.manage');
    const b = (req.body ?? {}) as Record<string, any>;
    const type: PartyType = b.type === 'supplier' ? 'supplier' : 'customer';
    const company = (b.company ?? '').toString().trim();
    if (!company) throw new ScopeError(400, 'invalid_company', 'A company name is required.');
    const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'party';
    const email = (b.email ?? '').toString().trim().toLowerCase() || `${type}-${slug}@parties.sightlive.local`;

    const { result } = await createCustomersWorkflow(req.scope).run({
      input: {
        customersData: [{
          email,
          company_name: company,
          metadata: {
            party_type: type,
            spend_limit: num(b.limit),
            currency: (b.currency || 'ZAR').toString(),
            tax_exempt: b.taxExempt === true,
            category: b.category || null,
            lead_time: b.leadTime || null,
          },
        }],
      } as Parameters<typeof createCustomersWorkflow>[0] extends never ? never : any,
    });
    const created = Array.isArray(result) ? result[0] : result;
    res.status(201).json(shape({ ...created, metadata: created?.metadata }, 0));
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'party_create_failed', message: (error as Error).message });
  }
}
