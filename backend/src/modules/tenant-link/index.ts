import { Module } from '@medusajs/framework/utils';
import TenantLinkModuleService from './service';

export const TENANT_LINK_MODULE = 'tenantLink';

export default Module(TENANT_LINK_MODULE, {
  service: TenantLinkModuleService,
});
