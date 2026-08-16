import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import type { ExecArgs } from '@medusajs/framework/types';

// Creates missing Medusa module link tables in the medusa schema so that
// createOrderWorkflow and inventory reservation queries succeed.
// Run via:
//   railway ssh --service Medusa "npm run bootstrap:links-tables"
const DDL = `
create table if not exists medusa.sales_channel_stock_location (
  id text primary key,
  sales_channel_id text not null,
  stock_location_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists idx_sales_channel_stock_location_unique 
on medusa.sales_channel_stock_location (sales_channel_id, stock_location_id) 
where deleted_at is null;

create table if not exists medusa.product_sales_channel (
  id text primary key,
  product_id text not null,
  sales_channel_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists idx_product_sales_channel_unique 
on medusa.product_sales_channel (product_id, sales_channel_id) 
where deleted_at is null;
`;

export default async function bootstrapLinksTables({ container }: ExecArgs): Promise<void> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION);
  await knex.raw(DDL);
  // eslint-disable-next-line no-console
  console.log('[links] medusa.sales_channel_stock_location and link tables verified.');
}
