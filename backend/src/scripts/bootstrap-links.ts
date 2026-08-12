import type { ExecArgs } from '@medusajs/framework/types';
import { TENANT_LINK_MODULE } from '../modules/tenant-link';

// Links a Supabase tenant/site to already-existing Medusa commerce resources
// (sales channel, region, stock location). It does NOT create commerce
// structures — create the Region, Sales Channel and Stock Location in Medusa
// Admin first, then pass their IDs here. Idempotent: re-running updates the
// existing link rather than duplicating it.
//
// Run from backend/:
//   SUPA_TENANT_ID=... SALES_CHANNEL_ID=... DEFAULT_REGION_ID=... \
//   SUPA_SITE_ID=...   STOCK_LOCATION_ID=... \
//   npm run bootstrap:links

type LinkRow = { id: string; status?: string };
type LinkService = {
  listTenantLinks(filters: Record<string, unknown>, config?: Record<string, unknown>): Promise<LinkRow[]>;
  createTenantLinks(data: Record<string, unknown>[]): Promise<LinkRow[]>;
  updateTenantLinks(data: Record<string, unknown>[]): Promise<LinkRow[]>;
  listSiteLinks(filters: Record<string, unknown>, config?: Record<string, unknown>): Promise<LinkRow[]>;
  createSiteLinks(data: Record<string, unknown>[]): Promise<LinkRow[]>;
  updateSiteLinks(data: Record<string, unknown>[]): Promise<LinkRow[]>;
};

const env = (key: string): string | undefined => process.env[key]?.trim() || undefined;

function required(key: string): string {
  const value = env(key);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

export default async function bootstrapLinks({ container }: ExecArgs): Promise<void> {
  const service = container.resolve(TENANT_LINK_MODULE) as unknown as LinkService;

  const supabaseTenantId = required('SUPA_TENANT_ID');
  const salesChannelId = required('SALES_CHANNEL_ID');
  const defaultRegionId = env('DEFAULT_REGION_ID') ?? null;

  // --- tenant -> sales channel (+ default region) ---------------------------
  const existingTenant = await service.listTenantLinks({ supabase_tenant_id: supabaseTenantId }, { take: 1 });
  if (existingTenant.length) {
    await service.updateTenantLinks([{
      id: existingTenant[0].id,
      sales_channel_id: salesChannelId,
      default_region_id: defaultRegionId,
      status: 'active',
    }]);
    console.log(`tenant link updated for ${supabaseTenantId} -> sales_channel ${salesChannelId}`);
  } else {
    await service.createTenantLinks([{
      supabase_tenant_id: supabaseTenantId,
      sales_channel_id: salesChannelId,
      default_region_id: defaultRegionId,
      status: 'active',
    }]);
    console.log(`tenant link created for ${supabaseTenantId} -> sales_channel ${salesChannelId}`);
  }

  // --- site -> stock location (optional) ------------------------------------
  const supabaseSiteId = env('SUPA_SITE_ID');
  if (supabaseSiteId) {
    const stockLocationId = required('STOCK_LOCATION_ID'); // required once a site is being linked
    const siteSalesChannelId = env('SITE_SALES_CHANNEL_ID') ?? salesChannelId;

    const existingSite = await service.listSiteLinks({ supabase_site_id: supabaseSiteId }, { take: 1 });
    if (existingSite.length) {
      await service.updateSiteLinks([{
        id: existingSite[0].id,
        supabase_tenant_id: supabaseTenantId,
        stock_location_id: stockLocationId,
        sales_channel_id: siteSalesChannelId,
        status: 'active',
      }]);
      console.log(`site link updated for ${supabaseSiteId} -> stock_location ${stockLocationId}`);
    } else {
      await service.createSiteLinks([{
        supabase_site_id: supabaseSiteId,
        supabase_tenant_id: supabaseTenantId,
        stock_location_id: stockLocationId,
        sales_channel_id: siteSalesChannelId,
        status: 'active',
      }]);
      console.log(`site link created for ${supabaseSiteId} -> stock_location ${stockLocationId}`);
    }
  } else {
    console.log('SUPA_SITE_ID not set — skipping site→stock-location link (catalogue reads will run tenant-only).');
  }

  console.log('Link bootstrap complete.');
}
