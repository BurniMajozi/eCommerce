import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { updateCustomersWorkflow, deleteCustomersWorkflow } from '@medusajs/medusa/core-flows';
import { assertCapability, ScopeError } from '../../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../../middlewares/tenant-scope';

const num = (v: any): number | null => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));

// PATCH /app/commerce/parties/:id — edit the spend/purchase limit (and fields).
// Reads existing metadata and merges so an edit never clobbers party_type etc.
export async function PATCH(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.manage');
    const b = (req.body ?? {}) as Record<string, any>;
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

    const { data: existing } = await query.graph({
      entity: 'customer',
      fields: ['id', 'company_name', 'metadata'],
      filters: { id: req.params.id },
    } as Parameters<typeof query.graph>[0]);
    const cur = (existing ?? [])[0];
    if (!cur) throw new ScopeError(404, 'party_not_found', 'Party not found.');

    const md: Record<string, any> = { ...(cur.metadata || {}) };
    if ('limit' in b) md.spend_limit = num(b.limit);
    if ('spent' in b) md.spend_used = num(b.spent);
    if ('currency' in b && b.currency) md.currency = String(b.currency);
    if ('taxExempt' in b) md.tax_exempt = b.taxExempt === true;
    if ('category' in b) md.category = b.category || null;
    if ('leadTime' in b) md.lead_time = b.leadTime || null;

    const update: Record<string, any> = { metadata: md };
    if (b.company != null && String(b.company).trim()) update.company_name = String(b.company).trim();

    await updateCustomersWorkflow(req.scope).run({
      input: { selector: { id: req.params.id }, update } as Parameters<typeof updateCustomersWorkflow>[0] extends never ? never : any,
    });
    res.json({ id: req.params.id, limit: num(md.spend_limit), currency: md.currency ?? 'ZAR', taxExempt: md.tax_exempt === true });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'party_update_failed', message: (error as Error).message });
  }
}

// DELETE /app/commerce/parties/:id — remove a customer or supplier.
export async function DELETE(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.manage');
    await deleteCustomersWorkflow(req.scope).run({ input: { ids: [req.params.id] } });
    res.json({ id: req.params.id, deleted: true });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'party_delete_failed', message: (error as Error).message });
  }
}
