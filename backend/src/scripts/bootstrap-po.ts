import { Client } from 'pg';

// Creates the public.purchase_orders table in the identity DB. Run in-container:
//   railway ssh --service Medusa "npm run bootstrap:po"
const DDL = `
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  supplier_id text,
  supplier_name text not null,
  status text not null default 'draft' check (status in ('draft','sent','received','cancelled')),
  currency text not null default 'ZAR',
  reference text,
  expected_date date,
  lines jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  received_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists purchase_orders_tenant_idx on public.purchase_orders(tenant_id);
create index if not exists purchase_orders_supplier_idx on public.purchase_orders(supplier_id);
alter table public.purchase_orders enable row level security;
drop policy if exists purchase_orders_select on public.purchase_orders;
create policy purchase_orders_select on public.purchase_orders
  for select to authenticated
  using (public.has_capability(tenant_id, 'commerce.read'));
`;

export default async function bootstrapPo(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set.');
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(DDL);
    try { await client.query("notify pgrst, 'reload schema'"); } catch { /* not fatal */ }
    // eslint-disable-next-line no-console
    console.log('[po] purchase_orders table ready.');
  } finally {
    await client.end();
  }
}
