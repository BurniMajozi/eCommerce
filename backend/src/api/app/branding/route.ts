import type { MedusaResponse } from '@medusajs/framework/http';
import { ScopeError } from '../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../middlewares/tenant-scope';
import { getServiceClient } from '../../../security/supabase-scope-resolver';

// GET /app/branding — the caller's OWN active-tenant white-label branding, so
// the app can skin itself (accent + logo) for that merchant/plant. Readable by
// any authenticated member of the tenant (branding is not sensitive); the logo
// lives in a private bucket, so it's returned as a short-lived signed URL.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    const db = getServiceClient();

    const { data: tenant } = await db.from('tenants').select('name').eq('id', scope.tenantId).maybeSingle();
    const { data: brand } = await db.from('tenant_branding').select('accent_color, logo_path').eq('tenant_id', scope.tenantId).maybeSingle();

    let logoUrl: string | null = null;
    if (brand?.logo_path) {
      try {
        const { data: signed } = await db.storage.from('ppe-private').createSignedUrl(brand.logo_path, 60 * 60);
        logoUrl = signed?.signedUrl ?? null;
      } catch { /* logo optional — fall back to the wordmark */ }
    }

    res.json({ tenantName: tenant?.name ?? null, accent: brand?.accent_color ?? null, logoUrl });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'branding_failed', message: (error as Error).message });
  }
}
