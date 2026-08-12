import { MedusaService } from '@medusajs/framework/utils';
import SiteLink from './models/site-link';
import TenantLink from './models/tenant-link';

class TenantLinkModuleService extends MedusaService({ TenantLink, SiteLink }) {}

export default TenantLinkModuleService;
