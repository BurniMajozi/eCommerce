import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import type { ExecArgs } from '@medusajs/framework/types';

// Platform subscription invoices (one row per tenant per billing period, charged
// via Paystack). Kept in Medusa's own schema. Run: npm run bootstrap:billing
const DDL = `
create table if not exists platform_invoices (
  id text primary key,
  tenant_id text not null,
  tenant_name text,
  period text not null,
  plan text not null,
  seats integer not null default 0,
  base_amount numeric not null default 0,
  seat_amount numeric not null default 0,
  total numeric not null default 0,
  currency text not null default 'ZAR',
  status text not null default 'issued',
  paystack_ref text,
  payer_email text,
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists platform_invoices_tenant_period_uq on platform_invoices(tenant_id, period);
create index if not exists platform_invoices_status_idx on platform_invoices(status);
`;

export default async function bootstrapBilling({ container }: ExecArgs): Promise<void> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION);
  await knex.raw(DDL);
  // eslint-disable-next-line no-console
  console.log('[billing] platform_invoices table ready.');
}
