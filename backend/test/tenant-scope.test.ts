import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCapability, buildTenantScope, ScopeError } from '../src/security/tenant-scope';

const userId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';
const siteId = '33333333-3333-4333-8333-333333333333';

test('builds an immutable scope only from the resolved membership', () => {
  const scope = buildTenantScope(
    { sub: userId, aal: 'aal2' },
    tenantId,
    siteId,
    { user_id: userId, tenant_id: tenantId, site_id: siteId, roles: ['manager'], capabilities: ['ppe.approve.tier2'] },
  );
  assert.equal(scope.tenantId, tenantId);
  assert.equal(scope.assuranceLevel, 'aal2');
  assert.ok(Object.isFrozen(scope));
  assert.ok(Object.isFrozen(scope.capabilities));
});

test('denies a resolved membership from another tenant', () => {
  assert.throws(
    () => buildTenantScope(
      { sub: userId },
      tenantId,
      undefined,
      { user_id: userId, tenant_id: '44444444-4444-4444-8444-444444444444', site_id: null, roles: [], capabilities: [] },
    ),
    (error: unknown) => error instanceof ScopeError && error.code === 'tenant_access_denied',
  );
});

test('denies a site outside the server-resolved scope', () => {
  assert.throws(
    () => buildTenantScope(
      { sub: userId }, tenantId, siteId,
      { user_id: userId, tenant_id: tenantId, site_id: null, roles: [], capabilities: [] },
    ),
    (error: unknown) => error instanceof ScopeError && error.code === 'site_access_denied',
  );
});

test('requires both a capability and aal2 for privileged actions', () => {
  const aal1 = buildTenantScope(
    { sub: userId, aal: 'aal1' }, tenantId, undefined,
    { user_id: userId, tenant_id: tenantId, site_id: null, roles: ['manager'], capabilities: ['ppe.approve.tier2'] },
  );
  assert.throws(
    () => assertCapability(aal1, 'ppe.approve.tier2', true),
    (error: unknown) => error instanceof ScopeError && error.code === 'mfa_required',
  );
  assert.throws(
    () => assertCapability(aal1, 'platform.manage'),
    (error: unknown) => error instanceof ScopeError && error.code === 'capability_required',
  );
});
