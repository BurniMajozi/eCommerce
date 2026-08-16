-- ============================================================================
-- 004_medusa_link_tables.sql
-- Creates all Medusa v2 module link tables in the `medusa` schema.
-- Run in Supabase SQL Editor.
-- ============================================================================

GRANT ALL ON SCHEMA medusa TO postgres;
GRANT medusa_app TO postgres;

-- 1. order_promotion
CREATE TABLE IF NOT EXISTS medusa.order_promotion (
  id text PRIMARY KEY,
  order_id text NOT NULL,
  promotion_id text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_promotion_unique 
ON medusa.order_promotion (order_id, promotion_id) 
WHERE deleted_at IS NULL;
GRANT ALL PRIVILEGES ON TABLE medusa.order_promotion TO medusa_app;
GRANT ALL PRIVILEGES ON TABLE medusa.order_promotion TO postgres;

-- 2. order_sales_channel
CREATE TABLE IF NOT EXISTS medusa.order_sales_channel (
  id text PRIMARY KEY,
  order_id text NOT NULL,
  sales_channel_id text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_sales_channel_unique 
ON medusa.order_sales_channel (order_id, sales_channel_id) 
WHERE deleted_at IS NULL;
GRANT ALL PRIVILEGES ON TABLE medusa.order_sales_channel TO medusa_app;
GRANT ALL PRIVILEGES ON TABLE medusa.order_sales_channel TO postgres;

-- 3. order_customer
CREATE TABLE IF NOT EXISTS medusa.order_customer (
  id text PRIMARY KEY,
  order_id text NOT NULL,
  customer_id text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_customer_unique 
ON medusa.order_customer (order_id, customer_id) 
WHERE deleted_at IS NULL;
GRANT ALL PRIVILEGES ON TABLE medusa.order_customer TO medusa_app;
GRANT ALL PRIVILEGES ON TABLE medusa.order_customer TO postgres;

-- 4. cart_promotion
CREATE TABLE IF NOT EXISTS medusa.cart_promotion (
  id text PRIMARY KEY,
  cart_id text NOT NULL,
  promotion_id text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_promotion_unique 
ON medusa.cart_promotion (cart_id, promotion_id) 
WHERE deleted_at IS NULL;
GRANT ALL PRIVILEGES ON TABLE medusa.cart_promotion TO medusa_app;
GRANT ALL PRIVILEGES ON TABLE medusa.cart_promotion TO postgres;

-- 5. cart_sales_channel
CREATE TABLE IF NOT EXISTS medusa.cart_sales_channel (
  id text PRIMARY KEY,
  cart_id text NOT NULL,
  sales_channel_id text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_sales_channel_unique 
ON medusa.cart_sales_channel (cart_id, sales_channel_id) 
WHERE deleted_at IS NULL;
GRANT ALL PRIVILEGES ON TABLE medusa.cart_sales_channel TO medusa_app;
GRANT ALL PRIVILEGES ON TABLE medusa.cart_sales_channel TO postgres;

-- 6. cart_customer
CREATE TABLE IF NOT EXISTS medusa.cart_customer (
  id text PRIMARY KEY,
  cart_id text NOT NULL,
  customer_id text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_customer_unique 
ON medusa.cart_customer (cart_id, customer_id) 
WHERE deleted_at IS NULL;
GRANT ALL PRIVILEGES ON TABLE medusa.cart_customer TO medusa_app;
GRANT ALL PRIVILEGES ON TABLE medusa.cart_customer TO postgres;

-- 7. fulfillment_set_stock_location
CREATE TABLE IF NOT EXISTS medusa.fulfillment_set_stock_location (
  id text PRIMARY KEY,
  fulfillment_set_id text NOT NULL,
  stock_location_id text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fulfillment_set_stock_location_unique 
ON medusa.fulfillment_set_stock_location (fulfillment_set_id, stock_location_id) 
WHERE deleted_at IS NULL;
GRANT ALL PRIVILEGES ON TABLE medusa.fulfillment_set_stock_location TO medusa_app;
GRANT ALL PRIVILEGES ON TABLE medusa.fulfillment_set_stock_location TO postgres;

-- 8. publishable_api_key_sales_channel
CREATE TABLE IF NOT EXISTS medusa.publishable_api_key_sales_channel (
  id text PRIMARY KEY,
  publishable_key_id text NOT NULL,
  sales_channel_id text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_publishable_api_key_sales_channel_unique 
ON medusa.publishable_api_key_sales_channel (publishable_key_id, sales_channel_id) 
WHERE deleted_at IS NULL;
GRANT ALL PRIVILEGES ON TABLE medusa.publishable_api_key_sales_channel TO medusa_app;
GRANT ALL PRIVILEGES ON TABLE medusa.publishable_api_key_sales_channel TO postgres;
