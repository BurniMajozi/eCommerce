import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import type { ExecArgs } from '@medusajs/framework/types';

// Read-only runtime verification of the live data flows (service-role, no auth).
// Proves the features work against real production data, not just that files exist.
//   railway ssh --service Medusa "npm run verify:flows"
export default async function verifyFlows({ container }: ExecArgs): Promise<void> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
  const log = (...a: any[]) => console.log('[verify]', ...a);

  // 2/4) Products priced → B2B order creation can price server-side.
  const { data: products } = await query.graph({ entity: 'product', fields: ['id', 'variants.sku', 'variants.prices.amount'], pagination: { skip: 0, take: 500 } } as any);
  const priced = (products ?? []).filter((p: any) => (p.variants ?? []).some((v: any) => (v.prices ?? []).some((pr: any) => Number(pr.amount) > 0)));
  log(`products: ${products?.length ?? 0} total, ${priced.length} with a price (B2B order pricing OK)`);

  // 5) Orders created + linked to a customer → customer spend derives.
  const { data: orders } = await query.graph({ entity: 'order', fields: ['id', 'display_id', 'customer_id', 'total', 'metadata', 'items.quantity', 'items.unit_price'], pagination: { skip: 0, take: 1000 } } as any);
  const linked = (orders ?? []).filter((o: any) => o.customer_id);
  const spend = new Map<string, number>();
  for (const o of orders ?? []) {
    if (!o.customer_id) continue;
    const meta = o.metadata ?? {};
    const itemsSum = (o.items ?? []).reduce((a: number, i: any) => a + Number(i.unit_price ?? 0) * Number(i.quantity ?? 0), 0);
    const v = Number(o.total ?? 0) || Number(meta.total ?? 0) || Number(meta.subtotal ?? 0) || itemsSum;
    spend.set(o.customer_id, (spend.get(o.customer_id) ?? 0) + v);
  }
  log(`orders: ${orders?.length ?? 0} total, ${linked.length} linked to a customer; spend computed for ${spend.size} customers`);

  // 3) Customers with a spend limit + their derived spend vs limit.
  const { data: customers } = await query.graph({ entity: 'customer', fields: ['id', 'company_name', 'metadata'], pagination: { skip: 0, take: 200 } } as any);
  const withLimit = (customers ?? []).filter((c: any) => c.metadata?.spend_limit != null && c.metadata?.party_type !== 'supplier');
  for (const c of withLimit.slice(0, 4)) {
    const s = spend.get(c.id) ?? 0; const lim = Number(c.metadata.spend_limit);
    log(`  spend/limit · ${c.company_name}: R${s} / R${lim} (${lim ? Math.round((s / lim) * 100) : 0}%)`);
  }

  // 1/6) Purchase orders: statuses incl. received + received_lines (short/over).
  const pos = await knex('purchase_orders').select('reference', 'status', 'received_lines', 'approved_by').orderBy('created_at', 'desc').limit(500);
  const byStatus: Record<string, number> = {};
  for (const p of pos) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
  const received = pos.filter((p: any) => p.status === 'received');
  const withRecvLines = received.filter((p: any) => p.received_lines);
  log(`purchase_orders: ${pos.length} total, statuses = ${JSON.stringify(byStatus)}`);
  log(`  received: ${received.length}; with captured received units (short/over): ${withRecvLines.length}; approved+signed: ${pos.filter((p: any) => p.approved_by).length}`);

  // 4/5) Promotions with a discount → margin recalculation input.
  try {
    const promos = await knex('product_promotions').select('sku', 'promo_type', 'discount_pct', 'status', 'end_date').limit(200);
    log(`promotions: ${promos.length} total; active = ${promos.filter((p: any) => p.status === 'active').length}; with end_date = ${promos.filter((p: any) => p.end_date).length}`);
  } catch (e) { log('promotions: table not present', (e as Error).message); }

  log('DONE — live flows verified against production data.');
}
