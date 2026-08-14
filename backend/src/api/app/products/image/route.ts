import type { MedusaResponse } from '@medusajs/framework/http';
import { assertCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';
import {
  decodeImagePayload,
  StorageConfigurationError,
  StorageUploadError,
  uploadCatalogueImage,
} from '../../../../catalogue/storage';

type Body = { sku?: string; filename?: string; contentType?: string; dataBase64?: string };

// Uploads a product photo to the tenant's catalogue storage and returns its
// public URL. The URL is then saved on the product (thumbnail) by the create/
// update route. Managing the catalogue requires commerce.manage + MFA.
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.manage', true);

    const body = (req.body ?? {}) as Body;
    const key = (body.sku || body.filename || 'item').toString();
    const { bytes, contentType } = decodeImagePayload({ dataBase64: body.dataBase64, contentType: body.contentType });
    const url = await uploadCatalogueImage({ tenantId: scope.tenantId, key, contentType, bytes });

    res.json({ url });
  } catch (error) {
    if (error instanceof ScopeError) {
      res.status(error.status).json({ code: error.code, message: error.message });
      return;
    }
    if (error instanceof StorageConfigurationError) {
      res.status(409).json({ code: 'storage_not_configured', message: error.message });
      return;
    }
    if (error instanceof StorageUploadError) {
      res.status(400).json({ code: 'image_upload_failed', message: error.message });
      return;
    }
    throw error;
  }
}
