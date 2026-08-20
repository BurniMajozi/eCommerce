import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import type { ExecArgs } from '@medusajs/framework/types';

// Contractor Store orders (retail PPE purchases, paid via Paystack, collected at
// the store counter). Kept in Medusa's own schema and reached through the tenant
// -scoped /app/store routes. Run in-container: npm run bootstrap:store
const DDL = `
create table if not exists store_orders (
  id text primary key,
  tenant_id text not null,
  reference text not null,
  buyer_name text,
  buyer_email text,
  buyer_phone text,
  company text,
  lines jsonb not null default '[]'::jsonb,
  currency text not null default 'ZAR',
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'pending',
  pickup_code text,
  paystack_ref text,
  paid_at timestamptz,
  collected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists store_orders_tenant_idx on store_orders(tenant_id);
create unique index if not exists store_orders_reference_uq on store_orders(reference);
create index if not exists store_orders_paystack_idx on store_orders(paystack_ref);
`;

export default async function bootstrapStore({ container }: ExecArgs): Promise<void> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION);
  await knex.raw(DDL);
  // eslint-disable-next-line no-console
  console.log('[store] store_orders table ready.');
}
