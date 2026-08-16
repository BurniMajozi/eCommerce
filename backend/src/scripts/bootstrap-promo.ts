import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import type { ExecArgs } from '@medusajs/framework/types';

// Creates the product_promotions table in Medusa's own schema (the DB role can
// create here; it cannot in Supabase's public schema). A promotion marks a
// product down by a percentage and is used to recalculate the displayed margin
// with a reduced cost basis. Accessed only via the tenant-scoped
// /app/commerce/promotions routes. Run in-container:
//   railway ssh --service Medusa "npm run bootstrap:promo"
const DDL = `
create table if not exists product_promotions (
  id text primary key,
  tenant_id text not null,
  product_id text not null,
  sku text not null,
  promo_type text not null default 'markdown',
  discount_pct numeric not null default 0,
  cost_at_create numeric,
  price_at_create numeric,
  status text not null default 'active',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_promotions_tenant_idx on product_promotions(tenant_id);
create index if not exists product_promotions_sku_idx on product_promotions(sku);
create index if not exists product_promotions_product_idx on product_promotions(product_id);
`;

export default async function bootstrapPromo({ container }: ExecArgs): Promise<void> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION);
  await knex.raw(DDL);
  // eslint-disable-next-line no-console
  console.log('[promo] product_promotions table ready.');
}
