import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import type { ExecArgs } from '@medusajs/framework/types';
import { STORE_DDL } from '../db/store-schema';

// Contractor Store orders (retail PPE purchases, paid via Paystack, collected at
// the store counter). Kept in Medusa's own schema and reached through the tenant
// -scoped /app/store routes. Run in-container: npm run bootstrap:store
export default async function bootstrapStore({ container }: ExecArgs): Promise<void> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION);
  await knex.raw(STORE_DDL);
  // eslint-disable-next-line no-console
  console.log('[store] store_orders table ready.');
}
