import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { randomUUID } from 'crypto';
import { assertCapability, assertAnyCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';
import { readCatalogueData } from '../../../../catalogue/read';
import { getServiceClient } from '../../../../security/supabase-scope-resolver';
import { sendEmailAsync, isEmailEnabled } from '../../../../lib/agentmail';
import { promoEmail } from '../../../../lib/email-templates';

// Product promotions: a merchant marks a catalogue product down by a percentage
// (type markdown | new | upgrade | focus). There is NO approval gate — creating a
// promo activates it immediately and it is reflected on the stock/price tables
// (the displayed cost basis is reduced by the discount, so the margin narrows).
// The promo is also recorded and surfaced to managers for visibility/history.
const ALLOWED_TYPES = ['markdown', 'new', 'upgrade', 'focus'];
// A manager may acknowledge/comment on a promo (visibility + history). Mirrors
// the PO approver capability set without gating activation.
const MANAGER_CAPS = ['ppe.approve.tier1', 'ppe.approve.tier2', 'platform.manage'];

const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
const now = () => new Date().toISOString();
const num = (v: any): number => (v == null || v === '' || isNaN(Number(v)) ? 0 : Number(v));

const todayStr = () => new Date().toISOString().slice(0, 10);
const toApi = (p: any) => {
  const expired = p.end_date && String(p.end_date).slice(0, 10) < todayStr();
  return {
    id: p.id,
    productId: p.product_id,
    sku: p.sku,
    promoType: p.promo_type,
    discountPct: num(p.discount_pct),
    costAtCreate: num(p.cost_at_create),
    priceAtCreate: num(p.price_at_create),
    status: expired ? 'expired' : p.status,
    endDate: p.end_date ? String(p.end_date).slice(0, 10) : null,
    expired: !!expired,
    createdBy: p.created_by,
    acknowledgedBy: p.acknowledged_by ?? null,
    acknowledgedAt: p.acknowledged_at ?? null,
    createdAt: p.created_at,
  };
};

// Resolve a catalogue product by id or sku to snapshot its cost + price at the
// moment the promo is created. Cost comes from variant metadata (MFA-gated in
// the UI) — if unavailable we still record the promo but cost stays null.
async function snapshotProduct(req: TenantScopedRequest, scope: NonNullable<TenantScopedRequest['tenantScope']>, productId?: string | null, sku?: string | null) {
  const { context } = await readCatalogueData(req, scope, true);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const filters: Record<string, any> = { sales_channels: { id: context.salesChannelId } };
  if (productId) filters.id = productId;
  else if (sku) filters.variants = { sku };
  const { data } = await query.graph({
    entity: 'product',
    fields: ['id', 'title', 'variants.id', 'variants.sku', 'variants.metadata', 'variants.prices.*'],
    filters,
  } as Parameters<typeof query.graph>[0]);
  const products = (data ?? []) as Array<Record<string, any>>;
  if (!products.length) return null;
  const prod = products[0];
  const variant = (prod.variants ?? [])[0];
  return {
    productId: prod.id,
    sku: variant?.sku ?? sku ?? prod.id,
    cost: num(variant?.metadata?.cost_price ?? prod.metadata?.cost_price),
    price: num(variant?.metadata?.selling_price ?? prod.metadata?.selling_price),
  };
}

// GET /app/commerce/promotions — list the tenant's product promotions, newest first.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, ['commerce.read', 'commerce.manage', ...MANAGER_CAPS]);
    const rows = await pg(req)('product_promotions').where({ tenant_id: scope.tenantId }).orderBy('created_at', 'desc');
    res.json({ source: 'medusa', promotions: rows.map(toApi) });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'promo_read_failed', message: (error as Error).message });
  }
}

// POST /app/commerce/promotions — create a product promotion (activates at once).
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.manage');
    const b = (req.body ?? {}) as Record<string, any>;
    const promoType = ALLOWED_TYPES.includes(b.promoType) ? b.promoType : 'markdown';
    const discountPct = Math.min(100, Math.max(0, num(b.discountPct)));
    if (discountPct <= 0) throw new ScopeError(400, 'invalid_discount', 'A promotion needs a discount percentage greater than 0.');
    if (!b.productId && !b.sku) throw new ScopeError(400, 'invalid_product', 'A product id or sku is required.');

    const snap = await snapshotProduct(req, scope, b.productId || null, b.sku || null);
    if (!snap) throw new ScopeError(404, 'product_not_found', 'That product is not in the tenant catalogue.');

    const id = randomUUID();
    await pg(req)('product_promotions').insert({
      id,
      tenant_id: scope.tenantId,
      product_id: snap.productId,
      sku: snap.sku,
      promo_type: promoType,
      discount_pct: discountPct,
      cost_at_create: snap.cost || null,
      price_at_create: snap.price || null,
      status: 'active',
      end_date: b.endDate || null,
      created_by: scope.userId ?? null,
      created_at: now(),
      updated_at: now(),
    });
    const [row] = await pg(req)('product_promotions').where({ id, tenant_id: scope.tenantId });

    // Notify managers of the new promo (visibility). Recipients are resolved
    // server-side from the tenant's manager/supervisor memberships. Best-effort:
    // never blocks the create, no-ops if email isn't configured.
    if (isEmailEnabled()) {
      try {
        const admin = getServiceClient();
        const { data: roleRows } = await admin.from('roles').select('id').in('key', ['manager', 'supervisor']);
        const roleIds = (roleRows ?? []).map((r: any) => r.id);
        if (roleIds.length) {
          const { data: mr } = await admin.from('membership_roles').select('membership_id').in('role_id', roleIds);
          const mids = [...new Set((mr ?? []).map((x: any) => x.membership_id))];
          if (mids.length) {
            const { data: mems } = await admin.from('memberships').select('user_id').eq('tenant_id', scope.tenantId).eq('status', 'active').in('id', mids as any[]);
            const userIds = [...new Set((mems ?? []).map((x: any) => x.user_id))].slice(0, 25);
            const emails: string[] = [];
            for (const uid of userIds) {
              const { data } = await admin.auth.admin.getUserById(uid as string);
              if (data?.user?.email) emails.push(data.user.email);
            }
            if (emails.length) {
              const { subject, html, text } = promoEmail({
                sku: snap.sku, name: snap.sku, promoType, discountPct,
                costWas: snap.cost || undefined, costNow: snap.cost ? snap.cost * (1 - discountPct / 100) : undefined,
                currency: (process.env.CURRENCY ?? 'zar').toUpperCase(), createdBy: scope.userId ?? undefined,
              });
              sendEmailAsync({ to: emails, subject, html, text, labels: ['promo'] }, 'promo managers');
            }
          }
        }
      } catch { /* email is best-effort */ }
    }

    res.status(201).json({ promotion: toApi(row) });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'promo_create_failed', message: (error as Error).message });
  }
}
