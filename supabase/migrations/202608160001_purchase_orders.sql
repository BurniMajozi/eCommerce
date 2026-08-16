-- Supplier purchase orders (inbound procurement). Stored in the identity DB
-- (same Postgres Medusa connects to) so the backend service client can CRUD them
-- while referencing Medusa supplier/customer ids and product ids. Lines are held
-- as JSONB: [{ product_id, sku, name, qty, unit_cost }].
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

-- Writes go through the backend service client (bypasses RLS); enable RLS so
-- direct authenticated/anon access is denied unless a policy allows it.
alter table public.purchase_orders enable row level security;

drop policy if exists purchase_orders_select on public.purchase_orders;
create policy purchase_orders_select on public.purchase_orders
  for select to authenticated
  using (public.has_capability(tenant_id, 'commerce.read'));

-- Ask PostgREST to refresh its schema cache so the new table is exposed.
notify pgrst, 'reload schema';
