/* oxlint-disable react/only-export-components -- provider and hook intentionally share one context module */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuthSession } from '../auth/AuthSessionContext';
import { MOCK_PLANTS, MOCK_TENANTS } from '../data/mockData';
import { supabase } from '../lib/supabase';

const TenantAccessContext = createContext(null);

const demoAccess = {
  memberships: [],
  tenants: MOCK_TENANTS,
  sites: MOCK_PLANTS,
  capabilities: [],
  roles: [],
};

export const TenantAccessProvider = ({ children }) => {
  const auth = useAuthSession();
  const [access, setAccess] = useState(demoAccess);
  const [activeTenantId, setActiveTenantId] = useState(MOCK_TENANTS[0]?.id ?? null);
  const [activeSiteId, setActiveSiteId] = useState(MOCK_PLANTS[1]?.id ?? MOCK_PLANTS[0]?.id ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadAccess = useCallback(async () => {
    if (!supabase || !auth.user) {
      setAccess(demoAccess);
      setError(null);
      return;
    }

    setLoading(true);
    const [membershipResult, globalRoleResult] = await Promise.all([
      supabase
        .from('memberships')
        .select(`
          id, tenant_id, status,
          tenant:tenants(id, name, slug, status),
          membership_sites(site:sites(id, tenant_id, name, code, status)),
          membership_roles(role:roles(id, key, name, membership_role_capabilities:role_capabilities(capability:capabilities(key))))
        `)
        .eq('user_id', auth.user.id)
        .eq('status', 'active'),
      supabase
        .from('global_user_roles')
        .select('role:roles(id, key, name, global_role_capabilities:role_capabilities(capability:capabilities(key)))')
        .eq('user_id', auth.user.id),
    ]);

    const queryError = membershipResult.error ?? globalRoleResult.error;

    if (queryError) {
      setError(queryError);
      setLoading(false);
      return;
    }

    const memberships = membershipResult.data ?? [];
    const globalRoles = globalRoleResult.data ?? [];
    const tenants = memberships.map((membership) => membership.tenant).filter(Boolean);
    const sites = memberships.flatMap((membership) =>
      (membership.membership_sites ?? []).map((entry) => entry.site).filter(Boolean));
    const roles = [...new Set([
      ...memberships.flatMap((membership) =>
        (membership.membership_roles ?? []).map((entry) => entry.role?.key).filter(Boolean)),
      ...globalRoles.map((entry) => entry.role?.key).filter(Boolean),
    ])];
    const capabilities = [...new Set([
      ...memberships.flatMap((membership) =>
      (membership.membership_roles ?? []).flatMap((entry) =>
        (entry.role?.membership_role_capabilities ?? []).map((grant) => grant.capability?.key).filter(Boolean))),
      ...globalRoles.flatMap((entry) =>
        (entry.role?.global_role_capabilities ?? []).map((grant) => grant.capability?.key).filter(Boolean)),
    ])];

    setAccess({ memberships, tenants, sites, roles, capabilities });
    setActiveTenantId((current) => tenants.some((tenant) => tenant.id === current) ? current : tenants[0]?.id ?? null);
    setActiveSiteId((current) => sites.some((site) => site.id === current) ? current : sites[0]?.id ?? null);
    setError(null);
    setLoading(false);
  }, [auth.user]);

  useEffect(() => { loadAccess(); }, [loadAccess]);

  const value = useMemo(() => ({
    ...access,
    mode: auth.configured ? 'supabase' : 'demo',
    loading: auth.loading || loading,
    error,
    activeTenantId,
    activeSiteId,
    activeTenant: access.tenants.find((tenant) => tenant.id === activeTenantId) ?? null,
    activeSite: access.sites.find((site) => site.id === activeSiteId) ?? null,
    setActiveTenantId,
    setActiveSiteId,
    hasCapability: (capability) => access.capabilities.includes(capability),
    refresh: loadAccess,
  }), [access, auth.configured, auth.loading, loading, error, activeTenantId, activeSiteId, loadAccess]);

  return <TenantAccessContext.Provider value={value}>{children}</TenantAccessContext.Provider>;
};

export const useTenantAccess = () => {
  const value = useContext(TenantAccessContext);
  if (!value) throw new Error('useTenantAccess must be used within TenantAccessProvider.');
  return value;
};
