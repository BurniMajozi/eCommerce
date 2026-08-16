-- ============================================================================
-- 004_medusa_link_tables.sql
-- Creates Medusa v2 link tables in the `medusa` schema needed by createOrderWorkflow
-- and inventory location resolution. Run as `postgres` or `medusa_app` in Supabase SQL Editor.
-- ============================================================================

-- 1. sales_channel_stock_location
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

grant all privileges on table medusa.sales_channel_stock_location to medusa_app;

-- 2. product_sales_channel
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

grant all privileges on table medusa.product_sales_channel to medusa_app;
