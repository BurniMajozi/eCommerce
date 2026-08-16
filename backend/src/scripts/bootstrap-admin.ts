import type { ExecArgs } from '@medusajs/framework/types';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { createTaxRegionsWorkflow, createPromotionsWorkflow, createCustomersWorkflow, updateCustomersWorkflow } from '@medusajs/medusa/core-flows';

// Seeds the Promotions / Tax / Customers modules so the admin screens show real
// data. Idempotent-ish: each block is independent and swallows "already exists"
// conflicts. Run in the container: npm run bootstrap:admin
export default async function bootstrapAdmin({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const run = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn(); logger.info(`[admin] ${label} ok`); }
    catch (e) { logger.warn(`[admin] ${label} skipped: ${(e as Error).message.slice(0, 160)}`); }
  };

  // NB: the tax-regions workflow input is a bare array (CreateTaxRegionDTO[]),
  // unlike promotions/customers which take a wrapper object.
  await run('tax regions', () => createTaxRegionsWorkflow(container).run({
    input: [
      { country_code: 'za', default_tax_rate: { name: 'VAT', rate: 15, code: 'ZA-VAT' } },
      { country_code: 'bw', default_tax_rate: { name: 'VAT', rate: 14, code: 'BW-VAT' } },
      { country_code: 'na', default_tax_rate: { name: 'VAT', rate: 15, code: 'NA-VAT' } },
    ] as any,
  }));

  await run('promotions', () => createPromotionsWorkflow(container).run({
    input: {
      promotionsData: [
        { code: 'MINE-Q3', type: 'standard', status: 'active', is_automatic: false, application_method: { type: 'percentage', target_type: 'items', value: 7.5, currency_code: 'zar', allocation: 'across' } },
        { code: 'NEWSITE', type: 'standard', status: 'active', is_automatic: false, application_method: { type: 'fixed', target_type: 'order', value: 2500, currency_code: 'zar', allocation: 'across' } },
      ],
    } as Parameters<typeof createPromotionsWorkflow>[0] extends never ? never : any,
  }));

  const CUSTOMERS = [
    { email: 'procurement@randcolliery.co.za', company_name: 'Rand Colliery', limit: 180000 },
    { email: 'procurement@debswana.bw', company_name: 'Debswana (Jwaneng)', limit: 420000 },
    { email: 'procurement@angloplatinum.co.za', company_name: 'Anglo Platinum', limit: 650000 },
    { email: 'procurement@rossing.com.na', company_name: 'Rössing Uranium', limit: 240000 },
  ];
  await run('customers', () => createCustomersWorkflow(container).run({
    input: {
      customersData: CUSTOMERS.map((c) => ({
        email: c.email, company_name: c.company_name, first_name: 'Procurement', last_name: 'Desk',
        metadata: { party_type: 'customer', spend_limit: c.limit, currency: 'ZAR' },
      })),
    } as Parameters<typeof createCustomersWorkflow>[0] extends never ? never : any,
  }));

  // Ensure spend limits are set even if the customers were seeded earlier
  // (before the party metadata existed).
  for (const c of CUSTOMERS) {
    await run(`limit:${c.company_name}`, () => updateCustomersWorkflow(container).run({
      input: { selector: { email: c.email }, update: { metadata: { party_type: 'customer', spend_limit: c.limit, currency: 'ZAR' } } } as Parameters<typeof updateCustomersWorkflow>[0] extends never ? never : any,
    }));
  }

  await run('suppliers', () => createCustomersWorkflow(container).run({
    input: {
      customersData: [
        { email: 'sales@dromex.co.za', company_name: 'DROMEX Africa', first_name: 'Sales', last_name: 'Desk', metadata: { party_type: 'supplier', spend_limit: 500000, currency: 'ZAR', category: 'Footwear & Gloves', lead_time: '5–7 days' } },
        { email: 'orders@cageli.co.za', company_name: 'CageLi Manufacturing', first_name: 'Orders', last_name: 'Desk', metadata: { party_type: 'supplier', spend_limit: 350000, currency: 'ZAR', category: 'Workwear', lead_time: '10–14 days' } },
        { email: 'trade@sisi-safety.co.za', company_name: 'Sisi Safety Wear', first_name: 'Trade', last_name: 'Desk', metadata: { party_type: 'supplier', spend_limit: 200000, currency: 'ZAR', category: 'Hi-vis & Head', lead_time: '7 days' } },
      ],
    } as Parameters<typeof createCustomersWorkflow>[0] extends never ? never : any,
  }));

  logger.info('[admin] done.');
}
