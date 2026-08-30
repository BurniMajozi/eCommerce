import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import type { ExecArgs } from '@medusajs/framework/types';

// In-app bug / feedback reports. Kept in Medusa's own schema and reached through
// the tenant-scoped /app/bugs routes. Run in-container: npm run bootstrap:bugs
const DDL = `
create table if not exists bug_reports (
  id text primary key,
  tenant_id text not null,
  reporter_user_id text,
  reporter_email text,
  reporter_name text,
  severity text not null default 'normal',
  title text not null,
  description text,
  route text,
  user_agent text,
  status text not null default 'open',
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bug_reports_tenant_idx on bug_reports(tenant_id);
create index if not exists bug_reports_status_idx on bug_reports(status);
`;

export default async function bootstrapBugs({ container }: ExecArgs): Promise<void> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION);
  await knex.raw(DDL);
  // eslint-disable-next-line no-console
  console.log('[bugs] bug_reports table ready.');
}
