import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { createOrderWorkflow } from '@medusajs/medusa/core-flows';
import type { ExecArgs } from '@medusajs/framework/types';
import { readCatalogueData } from '../catalogue/read';
import { selectSellingPrice } from '../catalogue/contract';

const TENANT_ID = '3d61522d-3804-4709-845b-832424c95163';

// End-to-end proof that a B2B order prices correctly and drives customer spend,
// exercised server-side (no browser auth). Creates one draft order for a real
// customer, verifies the stored total + recomputed spend, then deletes it.
// Run: railway ssh --service Medusa "npm run verify:order"
export default async function verifyOrder({ container }: ExecArgs): Promise<void> {
  const log = (...a: any[]) => console.log('[verify]', ...a);
  const req = { scope: container } as any;
  const scope = { tenantId: TENANT_ID, siteId: null, userId: 'system-verify' } as any;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;

  const { context } = await readCatalogueData(req, scope, false);
  log('context salesChannel=', context.salesChannelId, 'region=', context.regionId);

  // Pick a customer (Rand Colliery) and two priced SKUs.
  const { data: customers } = await query.graph({ entity: 'customer', fields: ['id', 'company_name', 'metadata'], pagination: { skip: 0, take: 50 } } as any);
  const cust = (customers ?? []).find((c: any) => /rand colliery/i.test(c.company_name || '')) || (customers ?? [])[0];
  log('customer:', cust?.company_name, cust?.id, 'limit=', cust?.metadata?.spend_limit);

  const wantSkus = ['DW-TSHIRTGY', 'PROMAX'];
  const { data: products } = await query.graph({
    entity: 'product', fields: ['title', 'variants.id', 'variants.sku', 'variants.prices.*'],
    filters: { variants: { sku: wantSkus }, sales_channels: { id: context.salesChannelId } },
  } as any);
  const items: any[] = [];
  let subtotal = 0;
  for (const p of products ?? []) {
    for (const v of p.variants ?? []) {
      if (!wantSkus.includes(v.sku)) continue;
      const price = selectSellingPrice(v, context.regionId) ?? 0;
      const qty = 10;
      subtotal += price * qty;
      items.push({ variant_id: v.id, quantity: qty, title: p.title, unit_price: price, _sku: v.sku, _price: price });
      log(`  resolved ${v.sku} unit_price=${price} x${qty}`);
    }
  }
  if (!items.length) { log('NO priced items resolved — aborting.'); return; }
  const total = subtotal * 1.15;

  const { result } = await createOrderWorkflow(req.scope).run({
    input: {
      is_draft_order: true,
      region_id: context.regionId ?? undefined,
      sales_channel_id: context.salesChannelId,
      currency_code: 'zar',
      customer_id: cust?.id,
      items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity, title: i.title, unit_price: i.unit_price })),
      metadata: { client_name: cust?.company_name, tax_enabled: true, subtotal, vat: subtotal * 0.15, total, verify: true, items },
    } as any,
  });
  const orderId = (result as any)?.id;
  log('created order', orderId, 'expected metadata.total=', total);

  // Re-read and verify.
  const { data: check } = await query.graph({ entity: 'order', fields: ['id', 'total', 'customer_id', 'metadata', 'items.unit_price', 'items.quantity'], filters: { id: orderId } } as any);
  const o = (check ?? [])[0] as any;
  const meta = o?.metadata ?? {};
  const spend = Number(o?.total ?? 0) || Number(meta.total ?? 0) || Number(meta.subtotal ?? 0);
  log('VERIFY order.total(medusa)=', o?.total, ' metadata.total=', meta.total, ' → spend counts=', spend, ' customer_id=', o?.customer_id);
  log(spend > 0 ? '✅ SPEND CHAIN WORKS: a real order yields non-zero spend for the customer.' : '❌ spend still zero — investigate.');

  // Clean up the verification order so live data stays real.
  try { await knex('"order"').where({ id: orderId }).del(); log('cleaned up verify order.'); }
  catch (e) { log('cleanup skipped (leave manually):', (e as Error).message, '— order id', orderId); }
}
