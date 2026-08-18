import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import type { ExecArgs } from '@medusajs/framework/types';

// Creates the purchase_orders table in Medusa's own schema (the DB role can
// create here; it cannot in Supabase's public schema). Accessed only via the
// tenant-scoped /app/commerce/purchase-orders routes. Run in-container:
//   railway ssh --service Medusa "npm run bootstrap:po"
const DDL = `
create table if not exists purchase_orders (
  id text primary key,
  tenant_id text not null,
  supplier_id text,
  supplier_name text not null,
  status text not null default 'draft',
  currency text not null default 'ZAR',
  reference text,
  expected_date date,
  lines jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  received_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists purchase_orders_tenant_idx on purchase_orders(tenant_id);
create index if not exists purchase_orders_supplier_idx on purchase_orders(supplier_id);
-- Approval + dispatch columns (idempotent for tables created before this).
alter table purchase_orders add column if not exists submitted_at timestamptz;
alter table purchase_orders add column if not exists approved_by text;
alter table purchase_orders add column if not exists approved_at timestamptz;
alter table purchase_orders add column if not exists approval_signature text;
alter table purchase_orders add column if not exists rejection_reason text;
alter table purchase_orders add column if not exists sent_at timestamptz;
alter table purchase_orders add column if not exists sent_to text;
-- Per-line quantities actually received (short or over) at receipt time.
alter table purchase_orders add column if not exists received_lines jsonb;
`;

export default async function bootstrapPo({ container }: ExecArgs): Promise<void> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION);
  await knex.raw(DDL);
  // eslint-disable-next-line no-console
  console.log('[po] purchase_orders table ready.');
}
