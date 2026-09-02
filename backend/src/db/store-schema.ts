// Idempotent schema used by both release verification and the Medusa bootstrap.
// ALTER is required because CREATE TABLE IF NOT EXISTS does not upgrade tables
// created by an earlier release.
export const STORE_DDL = `
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
  created_by text,
  paid_at timestamptz,
  collected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table store_orders add column if not exists created_by text;
create index if not exists store_orders_tenant_idx on store_orders(tenant_id);
create unique index if not exists store_orders_reference_uq on store_orders(reference);
create index if not exists store_orders_paystack_idx on store_orders(paystack_ref);
`;
