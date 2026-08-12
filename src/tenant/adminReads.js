import { supabase } from '../lib/supabase';

// Read-only helpers for the Platform Owner and Tenant Admin portals. Every query
// is filtered by Supabase Row-Level Security using the caller's session — the
// browser never selects a tenant it is not entitled to. In demo mode (no
// Supabase configured) these return null so the portals keep their mock data.

export async function fetchPlatformTenants() {
  if (!supabase) return null;
  const [{ data: tenants, error: tenantError }, { data: members, error: memberError }] = await Promise.all([
    supabase.from('tenants').select('id, name, slug, status, plan_key').order('name'),
    supabase.from('memberships').select('tenant_id, status'),
  ]);
  if (tenantError) throw tenantError;

  const activeCounts = {};
  if (!memberError && members) {
    for (const m of members) {
      if (m.status === 'active') activeCounts[m.tenant_id] = (activeCounts[m.tenant_id] ?? 0) + 1;
    }
  }

  return (tenants ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    domain: t.slug ? `${t.slug}.sightlive.app` : '—',
    users: activeCounts[t.id] ?? 0,
    plan: t.plan_key ?? 'trial',
    state: t.status,
  }));
}

export async function fetchAuditEvents(tenantId = null, limit = 20) {
  if (!supabase) return null;
  let query = supabase
    .from('audit_events')
    .select('id, tenant_id, actor_user_id, action, target_type, source, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (tenantId) query = query.eq('tenant_id', tenantId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchTenantMembers(tenantId) {
  if (!supabase || !tenantId) return null;
  const { data: memberships, error } = await supabase
    .from('memberships')
    .select('id, user_id, status, department, crew, membership_roles(role:roles(key, name))')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  // profiles has no direct FK from memberships (both reference auth.users), so
  // it is fetched separately and joined in memory. profiles_select RLS still
  // limits this to co-members of the caller's tenant.
  const userIds = [...new Set((memberships ?? []).map((m) => m.user_id))];
  const profiles = {};
  if (userIds.length) {
    const { data: rows } = await supabase
      .from('profiles')
      .select('id, display_name, employee_number, status')
      .in('id', userIds);
    for (const p of rows ?? []) profiles[p.id] = p;
  }

  return (memberships ?? []).map((m) => ({
    id: profiles[m.user_id]?.employee_number || m.user_id.slice(0, 8),
    name: profiles[m.user_id]?.display_name || '(member)',
    role: (m.membership_roles ?? []).map((entry) => entry.role?.name).filter(Boolean).join(', ') || '—',
    dept: m.department || '—',
    status: m.status,
  }));
}
