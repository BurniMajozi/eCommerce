import { model } from '@medusajs/framework/utils';

const SiteLink = model.define('site_link', {
  id: model.id().primaryKey(),
  supabase_site_id: model.text().unique(),
  supabase_tenant_id: model.text(),
  stock_location_id: model.text().nullable(),
  sales_channel_id: model.text().nullable(),
  status: model.enum(['active', 'suspended', 'closed']).default('active'),
  metadata: model.json().nullable(),
});

export default SiteLink;
