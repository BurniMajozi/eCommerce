import type { ExecArgs } from '@medusajs/framework/types';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { createTaxRegionsWorkflow, createPromotionsWorkflow, createCustomersWorkflow } from '@medusajs/medusa/core-flows';

// Seeds the Promotions / Tax / Customers modules so the admin screens show real
// data. Idempotent-ish: each block is independent and swallows "already exists"
// conflicts. Run in the container: npm run bootstrap:admin
export default async function bootstrapAdmin({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const run = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn(); logger.info(`[admin] ${label} ok`); }
    catch (e) { logger.warn(`[admin] ${label} skipped: ${(e as Error).message.slice(0, 160)}`); }
  };

  await run('tax regions', () => createTaxRegionsWorkflow(container).run({
    input: {
      tax_regions: [
        { country_code: 'za', default_tax_rate: { name: 'VAT', rate: 15, code: 'ZA-VAT' } },
        { country_code: 'bw', default_tax_rate: { name: 'VAT', rate: 14, code: 'BW-VAT' } },
        { country_code: 'na', default_tax_rate: { name: 'VAT', rate: 15, code: 'NA-VAT' } },
      ],
    } as Parameters<typeof createTaxRegionsWorkflow>[0] extends never ? never : any,
  }));

  await run('promotions', () => createPromotionsWorkflow(container).run({
    input: {
      promotionsData: [
        { code: 'MINE-Q3', type: 'standard', status: 'active', is_automatic: false, application_method: { type: 'percentage', target_type: 'items', value: 7.5, currency_code: 'zar', allocation: 'across' } },
        { code: 'NEWSITE', type: 'standard', status: 'active', is_automatic: false, application_method: { type: 'fixed', target_type: 'order', value: 2500, currency_code: 'zar', allocation: 'across' } },
      ],
    } as Parameters<typeof createPromotionsWorkflow>[0] extends never ? never : any,
  }));

  await run('customers', () => createCustomersWorkflow(container).run({
    input: {
      customersData: [
        { email: 'procurement@randcolliery.co.za', company_name: 'Rand Colliery', first_name: 'Procurement', last_name: 'Desk' },
        { email: 'procurement@debswana.bw', company_name: 'Debswana (Jwaneng)', first_name: 'Procurement', last_name: 'Desk' },
        { email: 'procurement@angloplatinum.co.za', company_name: 'Anglo Platinum', first_name: 'Procurement', last_name: 'Desk' },
        { email: 'procurement@rossing.com.na', company_name: 'Rössing Uranium', first_name: 'Procurement', last_name: 'Desk' },
      ],
    } as Parameters<typeof createCustomersWorkflow>[0] extends never ? never : any,
  }));

  logger.info('[admin] done.');
}
