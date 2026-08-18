import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import type { ExecArgs } from '@medusajs/framework/types';

// Read-only diagnostic of the live commerce state for the PO / order / promo /
// spend flows. Run: railway ssh --service Medusa "npm run inspect:state"
export default async function inspectState({ container }: ExecArgs): Promise<void> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const log = (...a: any[]) => console.log('[inspect]', ...a);

  // Orders — do they link a customer and carry a non-zero total?
  try {
    const { data: orders } = await query.graph({
      entity: 'order',
      fields: ['id', 'display_id', 'customer_id', 'email', 'total', 'item_total', 'is_draft_order', 'status', 'created_at', 'items.quantity', 'items.unit_price', 'metadata'],
      pagination: { skip: 0, take: 20, order: { created_at: 'DESC' } },
    } as any);
    log('ORDERS count(<=20 shown):', (orders ?? []).length);
    for (const o of (orders ?? []).slice(0, 5)) {
      const m = (o.metadata ?? {}) as any;
      const mItems = (m.items ?? []) as any[];
      log(` order ${o.display_id ?? o.id?.slice(0, 8)} orderTotal=${o.total ?? 'null'} META subtotal=${m.subtotal ?? 'none'} total=${m.total ?? 'none'} metaItem0_unit=${mItems[0]?.unit_price ?? mItems[0]?.unitPrice ?? 'none'}`);
    }
  } catch (e) { log('ORDERS query failed:', (e as Error).message); }

  // Customers — spend_limit metadata + spend summed from their orders.
  try {
    const { data: customers } = await query.graph({ entity: 'customer', fields: ['id', 'company_name', 'email', 'metadata'], pagination: { skip: 0, take: 50 } } as any);
    const { data: allOrders } = await query.graph({ entity: 'order', fields: ['customer_id', 'total', 'items.quantity', 'items.unit_price'], pagination: { skip: 0, take: 500 } } as any);
    const spent = new Map<string, number>();
    for (const o of allOrders ?? []) {
      if (!o.customer_id) continue;
      const items = (o.items ?? []) as any[];
      const t = Number(o.total ?? 0) || items.reduce((a, i) => a + Number(i.unit_price ?? 0) * Number(i.quantity ?? 0), 0);
      spent.set(o.customer_id, (spent.get(o.customer_id) ?? 0) + t);
    }
    const parties = (customers ?? []).filter((c: any) => (c.metadata?.party_type ?? 'customer') !== 'supplier');
    log('CUSTOMERS:', parties.length, ' (with spend_limit:', parties.filter((c: any) => c.metadata?.spend_limit != null).length, ')');
    for (const c of parties.slice(0, 8)) log(` cust ${c.company_name} limit=${c.metadata?.spend_limit ?? 'none'} spentFromOrders=${spent.get(c.id) ?? 0}`);
  } catch (e) { log('CUSTOMERS query failed:', (e as Error).message); }

  // Where do prices live — Medusa price sets vs variant metadata?
  try {
    const { data: prods } = await query.graph({ entity: 'product', fields: ['title', 'variants.sku', 'variants.prices.*', 'variants.metadata'], pagination: { skip: 0, take: 3 } } as any);
    for (const p of prods ?? []) {
      for (const v of ((p.variants ?? []) as any[]).slice(0, 1)) {
        const prices = (v.prices ?? []) as any[];
        log(` product "${String(p.title).slice(0, 24)}" sku=${v.sku} priceSet=[${prices.map((x) => `${x.amount}${x.currency_code}`).join(',')}] meta.selling=${v.metadata?.selling_price ?? 'none'} meta.cost=${v.metadata?.cost_price ?? 'none'}`);
      }
    }
  } catch (e) { log('PRICES query failed:', (e as Error).message); }

  // Purchase orders + promotions (raw tables in medusa schema).
  try {
    const po = await knex('purchase_orders').select('status').then((r: any[]) => r);
    const byStatus: Record<string, number> = {};
    for (const r of po) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    log('PURCHASE_ORDERS total:', po.length, JSON.stringify(byStatus));
  } catch (e) { log('PURCHASE_ORDERS failed:', (e as Error).message); }
  try {
    const promos = await knex('product_promotions').select('sku', 'promo_type', 'discount_pct', 'status', 'acknowledged_by');
    log('PRODUCT_PROMOTIONS total:', promos.length);
    for (const p of promos.slice(0, 8)) log(` promo ${p.sku} ${p.promo_type} ${p.discount_pct}% status=${p.status} ack=${p.acknowledged_by ?? 'no'}`);
  } catch (e) { log('PRODUCT_PROMOTIONS failed:', (e as Error).message); }
}
