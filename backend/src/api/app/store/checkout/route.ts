import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { randomUUID } from 'crypto';
import { buildCatalogueContract } from '../../../../catalogue/contract';
import { readCatalogueData, CatalogueConfigurationError } from '../../../../catalogue/read';
import { assertAnyCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';

// Anyone provisioned in the tenant (contractors are workers) may buy from the store.
const BUY_CAPS = ['ppe.request.create', 'commerce.read', 'commerce.manage', 'platform.manage'];
const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
const today = () => new Date().toISOString().slice(0, 10);
const pickupCode = () => 'PU-' + Math.random().toString(36).slice(2, 6).toUpperCase() + Math.floor(100 + Math.random() * 900);

// POST /app/store/checkout — price the basket server-side (contract price minus
// any active promo), create a pending store order, and initialise a Paystack
// transaction. Returns the authorization_url to redirect the buyer to.
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, BUY_CAPS);
    const b = (req.body ?? {}) as Record<string, any>;
    const email = (b.email ?? '').toString().trim().toLowerCase();
    if (!email || !/.+@.+\..+/.test(email)) throw new ScopeError(400, 'invalid_email', 'A valid email is required for the receipt.');
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) throw new ScopeError(400, 'empty_basket', 'Your basket is empty.');

    // Server-authoritative selling prices from the catalogue.
    const data = await readCatalogueData(req, scope, false);
    const catalogue = buildCatalogueContract(data.products, data.inventoryLevels, data.context) as { items: Array<Record<string, any>> };
    const priceBySku = new Map<string, { price: number; name: string; imageUrl: string | null }>();
    for (const it of catalogue.items) if (it.sku) priceBySku.set(it.sku, { price: Number(it.sellingPrice || 0), name: it.name, imageUrl: it.imageUrl ?? null });

    // Active, non-expired promos → retail discount for the store buyer.
    const promoBySku = new Map<string, number>();
    try {
      const promos = await pg(req)('product_promotions').select('sku', 'discount_pct', 'status', 'end_date');
      for (const p of promos) {
        const expired = p.end_date && String(p.end_date).slice(0, 10) < today();
        if (p.status === 'active' && !expired) promoBySku.set(p.sku, Number(p.discount_pct) || 0);
      }
    } catch { /* promotions table absent */ }

    let subtotal = 0, discount = 0;
    const lines = items.map((l: any) => {
      const sku = (l.sku ?? '').toString();
      const qty = Math.max(1, Math.floor(Number(l.qty ?? 1)));
      const ref = priceBySku.get(sku);
      if (!ref) throw new ScopeError(400, 'unknown_sku', `“${sku}” is not in the catalogue.`);
      const pct = promoBySku.get(sku) ?? 0;
      const unit = ref.price;
      const unitNet = pct ? unit * (1 - pct / 100) : unit;
      subtotal += unit * qty;
      discount += (unit - unitNet) * qty;
      return { sku, name: ref.name, imageUrl: ref.imageUrl, qty, unit, discountPct: pct, unitNet, lineTotal: unitNet * qty };
    });
    const total = subtotal - discount;
    if (total <= 0) throw new ScopeError(400, 'invalid_total', 'The order total must be greater than zero.');

    const id = randomUUID();
    const reference = 'STORE-' + Date.now().toString(36).toUpperCase() + '-' + id.slice(0, 4).toUpperCase();
    const currency = 'ZAR';
    await pg(req)('store_orders').insert({
      id, tenant_id: scope.tenantId, reference,
      buyer_name: (b.name ?? '').toString().trim() || null,
      buyer_email: email,
      buyer_phone: (b.phone ?? '').toString().trim() || null,
      company: (b.company ?? '').toString().trim() || null,
      lines: JSON.stringify(lines), currency, subtotal, discount, total,
      status: 'pending', pickup_code: pickupCode(), created_by: scope.userId,
    });

    // Initialise Paystack. Without a key the store still records the order but
    // returns needsPaymentSetup so the UI can explain.
    const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
    if (!secret) {
      res.status(201).json({ reference, total, currency, needsPaymentSetup: true, message: 'Order recorded but Paystack is not configured (PAYSTACK_SECRET_KEY missing).' });
      return;
    }
    const origin = (req.headers.origin as string) || process.env.STORE_URL || '';
    const callbackUrl = origin ? `${origin.replace(/\/$/, '')}/?store_ref=${reference}` : undefined;
    const psRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, amount: Math.round(total * 100), currency, reference, callback_url: callbackUrl, metadata: { tenant_id: scope.tenantId, kind: 'contractor_store' } }),
    });
    const psJson: any = await psRes.json().catch(() => ({}));
    if (!psRes.ok || !psJson?.status || !psJson?.data?.authorization_url) {
      await pg(req)('store_orders').where({ id }).update({ status: 'failed', updated_at: new Date().toISOString() });
      throw new ScopeError(502, 'paystack_init_failed', psJson?.message || 'Payment could not be started.');
    }
    await pg(req)('store_orders').where({ id }).update({ paystack_ref: psJson.data.reference || reference, updated_at: new Date().toISOString() });
    res.status(201).json({ reference, total, currency, authorizationUrl: psJson.data.authorization_url, accessCode: psJson.data.access_code });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    if (error instanceof CatalogueConfigurationError) { res.status(409).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'checkout_failed', message: (error as Error).message });
  }
}
