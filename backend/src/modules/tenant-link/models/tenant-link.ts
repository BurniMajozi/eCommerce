import { model } from '@medusajs/framework/utils';

const TenantLink = model.define('tenant_link', {
  id: model.id().primaryKey(),
  supabase_tenant_id: model.text().unique(),
  sales_channel_id: model.text().nullable(),
  default_region_id: model.text().nullable(),
  status: model.enum(['setup', 'active', 'suspended', 'closed']).default('setup'),
  metadata: model.json().nullable(),
});

export default TenantLink;
