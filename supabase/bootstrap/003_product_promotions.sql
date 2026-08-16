-- ============================================================================
-- Product promotions (one-time). Run in the Supabase SQL Editor as `postgres`
-- (bypasses RLS) OR via the Medusa bootstrap script (preferred):
--   railway ssh --service Medusa "npm run bootstrap:promo"
--
-- The table lives in the `medusa` schema (Medusa's own schema), which the DB
-- role `medusa_app` can create in but Supabase's public schema it cannot.
-- Mirrors supabase/bootstrap/002_medusa_schema.sql isolation. Idempotent.
-- ============================================================================

create table if not exists medusa.product_promotions (
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
  acknowledged_by text,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_promotions_tenant_idx on medusa.product_promotions(tenant_id);
create index if not exists product_promotions_sku_idx on medusa.product_promotions(sku);
create index if not exists product_promotions_product_idx on medusa.product_promotions(product_id);
