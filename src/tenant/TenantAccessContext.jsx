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

const emptyAccess = {
  memberships: [],
  tenants: [],
  sites: [],
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
  const [resolvedUserId, setResolvedUserId] = useState(null);

  const loadAccess = useCallback(async () => {
    if (!supabase || !auth.user) {
      setAccess(demoAccess);
      setError(null);
      setLoading(false);
      setResolvedUserId(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [membershipResult, globalRoleResult] = await Promise.all([
        supabase
          .from('memberships')
          .select(`
            id, tenant_id, status,
            tenant:tenants(id, name, slug, status)
          `)
          .eq('user_id', auth.user.id)
          .eq('status', 'active'),
        supabase
          .from('global_user_roles')
          .select('role_id')
          .eq('user_id', auth.user.id),
      ]);

      const queryError = membershipResult.error ?? globalRoleResult.error;
      if (queryError) throw queryError;

      const memberships = membershipResult.data ?? [];
      const membershipIds = memberships.map((membership) => membership.id);
      const [membershipSiteResult, membershipRoleResult] = await Promise.all([
        membershipIds.length
          ? supabase.from('membership_sites').select('membership_id, site:sites(id, tenant_id, name, code, status)').in('membership_id', membershipIds)
          : Promise.resolve({ data: [], error: null }),
        membershipIds.length
          ? supabase.from('membership_roles').select('membership_id, role_id').in('membership_id', membershipIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const membershipGrantError = membershipSiteResult.error ?? membershipRoleResult.error;
      if (membershipGrantError) throw membershipGrantError;

      const membershipRoleRows = membershipRoleResult.data ?? [];
      const globalRoleRows = globalRoleResult.data ?? [];
      const roleIds = [...new Set([
        ...membershipRoleRows.map((entry) => entry.role_id),
        ...globalRoleRows.map((entry) => entry.role_id),
      ].filter(Boolean))];
      const [roleResult, roleCapabilityResult] = await Promise.all([
        roleIds.length
          ? supabase.from('roles').select('id, key, name').in('id', roleIds)
          : Promise.resolve({ data: [], error: null }),
        roleIds.length
          ? supabase.from('role_capabilities').select('role_id, capability:capabilities(key)').in('role_id', roleIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const roleGrantError = roleResult.error ?? roleCapabilityResult.error;
      if (roleGrantError) throw roleGrantError;

      const rolesById = new Map((roleResult.data ?? []).map((role) => [role.id, role]));
      const globalRoles = globalRoleRows.map((entry) => rolesById.get(entry.role_id)).filter(Boolean);
      const isPlatformOwner = globalRoles.some((role) => role.key === 'platform_owner');
      let tenants = memberships.map((membership) => membership.tenant).filter(Boolean);
      let sites = (membershipSiteResult.data ?? []).map((entry) => entry.site).filter(Boolean);
      if (isPlatformOwner) {
        const [tenantResult, siteResult] = await Promise.all([
          supabase.from('tenants').select('id, name, slug, status').in('status', ['setup', 'active']).order('name'),
          supabase.from('sites').select('id, tenant_id, name, code, status').eq('status', 'active').order('name'),
        ]);
        const ownerQueryError = tenantResult.error ?? siteResult.error;
        if (ownerQueryError) throw ownerQueryError;
        tenants = tenantResult.data ?? [];
        sites = siteResult.data ?? [];
      }
      const roles = [...new Set([
        ...membershipRoleRows.map((entry) => rolesById.get(entry.role_id)?.key).filter(Boolean),
        ...globalRoles.map((role) => role.key).filter(Boolean),
      ])];
      const capabilities = [...new Set((roleCapabilityResult.data ?? [])
        .map((grant) => grant.capability?.key)
        .filter(Boolean))];

      setAccess({ memberships, tenants, sites, roles, capabilities });
      setActiveTenantId((current) => tenants.some((tenant) => tenant.id === current) ? current : tenants[0]?.id ?? null);
      setActiveSiteId((current) => sites.some((site) => site.id === current) ? current : sites[0]?.id ?? null);
    } catch (queryError) {
      // Never retain demo or another user's scope after a live access failure.
      setAccess(emptyAccess);
      setActiveTenantId(null);
      setActiveSiteId(null);
      setError(queryError);
    } finally {
      setResolvedUserId(auth.user.id);
      setLoading(false);
    }
  }, [auth.user]);

  useEffect(() => { loadAccess(); }, [loadAccess]);

  useEffect(() => {
    if (!auth.configured) return;
    const tenantSites = access.sites.filter((site) => site.tenant_id === activeTenantId);
    setActiveSiteId((current) => tenantSites.some((site) => site.id === current) ? current : tenantSites[0]?.id ?? null);
  }, [access.sites, activeTenantId, auth.configured]);

  const value = useMemo(() => ({
    ...access,
    mode: auth.configured ? 'supabase' : 'demo',
    loading: auth.loading || loading || Boolean(auth.configured && auth.user && resolvedUserId !== auth.user.id),
    error,
    activeTenantId,
    activeSiteId,
    activeTenant: access.tenants.find((tenant) => tenant.id === activeTenantId) ?? null,
    activeSite: access.sites.find((site) => site.id === activeSiteId && site.tenant_id === activeTenantId) ?? null,
    setActiveTenantId,
    setActiveSiteId,
    hasCapability: (capability) => access.capabilities.includes(capability),
    refresh: loadAccess,
  }), [access, auth.configured, auth.loading, auth.user, resolvedUserId, loading, error, activeTenantId, activeSiteId, loadAccess]);

  return <TenantAccessContext.Provider value={value}>{children}</TenantAccessContext.Provider>;
};

export const useTenantAccess = () => {
  const value = useContext(TenantAccessContext);
  if (!value) throw new Error('useTenantAccess must be used within TenantAccessProvider.');
  return value;
};
