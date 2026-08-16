export type AuthClaims = {
  sub?: string;
  aal?: string;
  email?: string;
  [key: string]: unknown;
};

export type ResolvedAccess = {
  user_id: string;
  tenant_id: string;
  site_id: string | null;
  roles: string[];
  capabilities: string[];
  mfa_capabilities?: string[];
};

export type TenantScope = Readonly<{
  userId: string;
  tenantId: string;
  siteId: string | null;
  roles: readonly string[];
  capabilities: readonly string[];
  mfaCapabilities: readonly string[];
  assuranceLevel: string;
}>;

export class ScopeError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertUuid(value: string | undefined, name: string): string {
  if (!value || !uuidPattern.test(value)) {
    throw new ScopeError(400, `invalid_${name}`, `${name} must be a UUID.`);
  }
  return value;
}

export function buildTenantScope(
  claims: AuthClaims,
  requestedTenantId: string | undefined,
  requestedSiteId: string | undefined,
  resolved: ResolvedAccess | null,
): TenantScope {
  const userId = assertUuid(claims.sub, 'user_id');
  const tenantId = assertUuid(requestedTenantId, 'tenant_id');
  const siteId = requestedSiteId ? assertUuid(requestedSiteId, 'site_id') : null;

  if (!resolved || resolved.user_id !== userId || resolved.tenant_id !== tenantId) {
    throw new ScopeError(403, 'tenant_access_denied', 'No active membership exists for this tenant.');
  }
  if ((resolved.site_id ?? null) !== siteId) {
    throw new ScopeError(403, 'site_access_denied', 'The requested site is not in the active membership scope.');
  }

  return Object.freeze({
    userId,
    tenantId,
    siteId,
    roles: Object.freeze([...new Set(resolved.roles ?? [])]),
    capabilities: Object.freeze([...new Set(resolved.capabilities ?? [])]),
    mfaCapabilities: Object.freeze([...new Set(resolved.mfa_capabilities ?? [])]),
    assuranceLevel: typeof claims.aal === 'string' ? claims.aal : 'aal1',
  });
}

// Passes if the scope holds ANY of the given capabilities. Used by cross-cutting
// routes (e.g. reports) reachable by more than one role family — a tenant admin
// has reports.read but not commerce.read, while a platform owner has the reverse.
export function assertAnyCapability(scope: TenantScope, capabilities: string[]): void {
  if (!capabilities.some((c) => scope.capabilities.includes(c))) {
    throw new ScopeError(403, 'capability_required', `One of [${capabilities.join(', ')}] is required.`);
  }
}

export function assertCapability(scope: TenantScope, capability: string, requireMfa = false): void {
  if (!scope.capabilities.includes(capability)) {
    throw new ScopeError(403, 'capability_required', `Capability ${capability} is required.`);
  }
  // MFA is enforced when the route asks for it OR the capability itself is
  // flagged requires_mfa in the database (surfaced via the resolved scope), so a
  // privileged capability can never be guarded without step-up by mistake.
  const needsMfa = requireMfa || scope.mfaCapabilities.includes(capability);
  if (needsMfa && scope.assuranceLevel !== 'aal2') {
    throw new ScopeError(403, 'mfa_required', 'A multi-factor authenticated session is required.');
  }
}
