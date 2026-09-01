import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import type { ExecArgs } from '@medusajs/framework/types';

// Remembers which accounts have completed their first (password) sign-in, so the
// login screen can ask returning users for just their email + an emailed code.
// Run in-container: npm run bootstrap:login-prefs
const DDL = `
create table if not exists login_prefs (
  email text primary key,
  bootstrapped boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
`;

export default async function bootstrapLoginPrefs({ container }: ExecArgs): Promise<void> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION);
  await knex.raw(DDL);
  // eslint-disable-next-line no-console
  console.log('[login-prefs] login_prefs table ready.');
}
