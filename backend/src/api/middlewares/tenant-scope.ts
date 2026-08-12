import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { assertCapability, buildTenantScope, ScopeError, type TenantScope } from '../../security/tenant-scope';
import { resolveSupabaseAccess, verifySupabaseJwt } from '../../security/supabase-scope-resolver';

export type TenantScopedRequest = MedusaRequest & { tenantScope?: TenantScope };

function header(req: MedusaRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function bearerToken(req: MedusaRequest): string {
  const authorization = header(req, 'authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new ScopeError(401, 'authentication_required', 'A Supabase bearer token is required.');
  }
  return authorization.slice('Bearer '.length).trim();
}

function sendError(res: MedusaResponse, error: unknown): void {
  if (error instanceof ScopeError) {
    res.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  res.status(401).json({ code: 'invalid_session', message: 'The authentication context could not be verified.' });
}

export async function tenantScopeMiddleware(
  req: TenantScopedRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
): Promise<void> {
  try {
    const claims = await verifySupabaseJwt(bearerToken(req));
    const tenantId = header(req, 'x-tenant-id');
    const siteId = header(req, 'x-site-id');
    const userId = claims.sub;
    if (!userId || !tenantId) {
      throw new ScopeError(400, 'scope_required', 'A valid user and X-Tenant-ID are required.');
    }
    const resolved = await resolveSupabaseAccess(userId, tenantId, siteId ?? null);
    req.tenantScope = buildTenantScope(claims, tenantId, siteId, resolved);
    next();
  } catch (error) {
    sendError(res, error);
  }
}

export function requireTenantCapability(capability: string, options: { mfa?: boolean } = {}) {
  return (req: TenantScopedRequest, res: MedusaResponse, next: MedusaNextFunction): void => {
    try {
      if (!req.tenantScope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
      assertCapability(req.tenantScope, capability, options.mfa === true);
      next();
    } catch (error) {
      sendError(res, error);
    }
  };
}
