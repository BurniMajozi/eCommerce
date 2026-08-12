import type { ExecArgs } from '@medusajs/framework/types';
import { Modules } from '@medusajs/framework/utils';

// Creates the commerce resources a tenant/site links to: one Region, one Sales
// Channel and one Stock Location. Idempotent (matches by name). Prints their IDs
// in the exact env-var form the link step expects, so the deploy flow is:
//
//   npm run bootstrap:commerce      # creates + prints IDs
//   SUPA_TENANT_ID=... SALES_CHANNEL_ID=... DEFAULT_REGION_ID=... \
//   SUPA_SITE_ID=...   STOCK_LOCATION_ID=... npm run bootstrap:links
//
// Override any name/currency via env. Verify against your Medusa version and run
// in a non-prod environment first.

const env = (key: string, fallback: string): string => process.env[key]?.trim() || fallback;

type Row = { id: string; name?: string };
type Svc = Record<string, (...args: unknown[]) => Promise<Row[]>>;

async function ensure(service: Svc, listFn: string, createFn: string, name: string, createPayload: Record<string, unknown>, label: string): Promise<Row> {
  const existing = await service[listFn]({ name }, { take: 1 });
  if (existing?.length) {
    console.log(`${label} exists: ${existing[0].id}`);
    return existing[0];
  }
  const [created] = await service[createFn]([createPayload]);
  console.log(`${label} created: ${created.id}`);
  return created;
}

export default async function bootstrapCommerce({ container }: ExecArgs): Promise<void> {
  const regionService = container.resolve(Modules.REGION) as unknown as Svc;
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL) as unknown as Svc;
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION) as unknown as Svc;

  const regionName = env('REGION_NAME', 'Southern Africa');
  const currency = env('REGION_CURRENCY', 'zar').toLowerCase();
  const countries = env('REGION_COUNTRIES', 'za').split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
  const channelName = env('SALES_CHANNEL_NAME', 'SightLive — Default');
  const locationName = env('STOCK_LOCATION_NAME', 'Central Store');

  const region = await ensure(regionService, 'listRegions', 'createRegions', regionName,
    { name: regionName, currency_code: currency, countries }, 'region');
  const channel = await ensure(salesChannelService, 'listSalesChannels', 'createSalesChannels', channelName,
    { name: channelName, description: 'Created by bootstrap-commerce' }, 'sales channel');
  const location = await ensure(stockLocationService, 'listStockLocations', 'createStockLocations', locationName,
    { name: locationName }, 'stock location');

  console.log('\nCopy these into the link step (npm run bootstrap:links):');
  console.log(`SALES_CHANNEL_ID=${channel.id}`);
  console.log(`DEFAULT_REGION_ID=${region.id}`);
  console.log(`STOCK_LOCATION_ID=${location.id}`);
}
