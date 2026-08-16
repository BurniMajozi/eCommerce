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
    membershipId: m.id,
    id: profiles[m.user_id]?.employee_number || m.user_id.slice(0, 8),
    name: profiles[m.user_id]?.display_name || '(member)',
    role: (m.membership_roles ?? []).map((entry) => entry.role?.name).filter(Boolean).join(', ') || '—',
    roleIds: (m.membership_roles ?? []).map((entry) => entry.role?.id).filter(Boolean),
    dept: m.department || '—',
    status: m.status,
  }));
}

// Real RBAC map: every role with the capabilities it grants. Read-only — role
// assignment is gated server-side (no client write policy yet). Selectable
// because roles / capabilities / role_capabilities all have SELECT RLS.
export async function fetchRolesCapabilities() {
  if (!supabase) return null;
  const [{ data: roles, error: rolesError }, { data: caps, error: capsError }, { data: links, error: linkError }] = await Promise.all([
    supabase.from('roles').select('id, key, name, description, privileged').order('name'),
    supabase.from('capabilities').select('key, description, requires_mfa').order('key'),
    supabase.from('role_capabilities').select('role_id, capability_id'),
  ]);
  if (rolesError) throw rolesError;
  if (capsError) throw capsError;
  if (linkError) throw linkError;

  const capById = new Map((caps ?? []).map((c) => [c.key, c]));
  const capKeyById = new Map();
  for (const c of caps ?? []) capKeyById.set(c.id ?? c.key, c.key);

  return (roles ?? []).map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    privileged: r.privileged,
    capabilities: (links ?? [])
      .filter((l) => l.role_id === r.id)
      .map((l) => capKeyById.get(l.capability_id))
      .filter(Boolean)
      .map((k) => capById.get(k))
      .filter(Boolean),
  }));
}

// ── Writes (require the 202608160001_owner_writes_rls migration) ─────────────

// Provision a new tenant + its branding row. Returns the new tenant id.
export async function provisionTenantDb(name, slug) {
  if (!supabase) throw new Error('Supabase not configured');
  const safeSlug = (slug || name || 'new-tenant').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const { data: tenant, error } = await supabase
    .from('tenants')
    .insert({ name, slug: safeSlug, status: 'setup', plan_key: 'trial' })
    .select('id, name, slug, status, plan_key')
    .single();
  if (error) throw error;
  // Seed a branding row so the accent/logo editor has something to update.
  await supabase.from('tenant_branding').upsert({ tenant_id: tenant.id, accent_color: '#2563EB' }).then(() => {});
  return tenant;
}

// Persist tenant branding (accent / ink / ground / logo_path).
export async function upsertTenantBranding(tenantId, patch) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase
    .from('tenant_branding')
    .upsert({ tenant_id: tenantId, ...patch, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// Upload a tenant logo to the private bucket (path: <tenantId>/logo.<ext>).
// Returns the storage object path (not a public URL — bucket is private).
export async function uploadTenantLogo(tenantId, file) {
  if (!supabase) throw new Error('Supabase not configured');
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${tenantId}/logo.${ext}`;
  const { error } = await supabase.storage.from('ppe-private').upload(path, file, { upsert: true, cacheControl: '3600' });
  if (error) throw error;
  return path;
}

// Invite a member to a tenant with the given role ids.
export async function inviteTenantMember(tenantId, email, roleIds) {
  if (!supabase) throw new Error('Supabase not configured');
  const token = crypto.randomUUID();
  const { error } = await supabase.from('invitations').insert({
    tenant_id: tenantId,
    email,
    invited_by: (await supabase.auth.getUser()).data.user?.id,
    role_ids: roleIds || [],
    site_ids: [],
    token_hash: token,
    status: 'pending',
    expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
  });
  if (error) throw error;
}

// Assign (or remove) a role on a membership.
export async function setMemberRole(membershipId, roleId, assign) {
  if (!supabase) throw new Error('Supabase not configured');
  if (assign) {
    const { error } = await supabase.from('membership_roles').insert({ membership_id: membershipId, role_id: roleId });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('membership_roles').delete().eq('membership_id', membershipId).eq('role_id', roleId);
    if (error) throw error;
  }
}

// Record an audit event (owner/platform actions).
export async function recordAudit(tenantId, action, targetType, source, meta = {}) {
  if (!supabase) return;
  await supabase.from('audit_events').insert({
    tenant_id: tenantId,
    actor_user_id: (await supabase.auth.getUser()).data.user?.id,
    action,
    target_type: targetType,
    source,
    metadata: meta,
  }).then(() => {}, () => {});
}
