-- Phase 1: Supabase identity, tenant membership, RBAC, RLS and read-only
-- realtime projections. Commerce and stock remain owned by Medusa.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  employee_number text,
  phone text,
  status text not null default 'active' check (status in ('active', 'suspended', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'setup' check (status in ('setup', 'active', 'suspended', 'closed')),
  plan_key text not null default 'trial',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  timezone text not null default 'Africa/Johannesburg',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code),
  unique (id, tenant_id)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text not null default '',
  privileged boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.capabilities (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text not null default '',
  requires_mfa boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.role_capabilities (
  role_id uuid not null references public.roles(id) on delete cascade,
  capability_id uuid not null references public.capabilities(id) on delete cascade,
  primary key (role_id, capability_id)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'active', 'suspended', 'revoked')),
  department text,
  crew text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (id, tenant_id)
);

create table public.membership_sites (
  membership_id uuid not null,
  site_id uuid not null,
  tenant_id uuid not null,
  primary key (membership_id, site_id),
  foreign key (membership_id, tenant_id) references public.memberships(id, tenant_id) on delete cascade,
  foreign key (site_id, tenant_id) references public.sites(id, tenant_id) on delete cascade
);

create table public.membership_roles (
  membership_id uuid not null references public.memberships(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  primary key (membership_id, role_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users(id),
  role_ids uuid[] not null default '{}',
  site_ids uuid[] not null default '{}',
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.tenant_branding (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  logo_path text,
  accent_color text not null default '#2563EB',
  ink_color text not null default '#0B1220',
  ground_color text not null default '#F3F4F6',
  custom_domain text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table public.feature_flags (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (tenant_id, key)
);

-- Read-only mirrors of Medusa domain events. Clients can subscribe/select but
-- cannot insert or mutate these rows.
create table public.realtime_projections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  site_id uuid references public.sites(id) on delete cascade,
  aggregate_type text not null,
  aggregate_id text not null,
  aggregate_version bigint not null default 1,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  correlation_id text,
  occurred_at timestamptz not null,
  projected_at timestamptz not null default now(),
  unique (tenant_id, aggregate_type, aggregate_id, aggregate_version, event_type)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'user',
  action text not null,
  target_type text not null,
  target_id text,
  before_hash text,
  after_hash text,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id text,
  source text not null,
  created_at timestamptz not null default now()
);

create index memberships_user_status_idx on public.memberships(user_id, status);
create index memberships_tenant_status_idx on public.memberships(tenant_id, status);
create index membership_sites_site_idx on public.membership_sites(site_id);
create index realtime_projection_scope_idx on public.realtime_projections(tenant_id, site_id, occurred_at desc);
create index audit_scope_idx on public.audit_events(tenant_id, site_id, created_at desc);

insert into public.capabilities (key, description, requires_mfa) values
  ('ppe.request.create', 'Create PPE requests', false),
  ('ppe.approve.tier1', 'Approve tier-one PPE requests', false),
  ('ppe.approve.tier2', 'Approve high-value or exception PPE requests', true),
  ('ppe.stock.issue', 'Verify pickup and issue stock', true),
  ('commerce.read', 'Read tenant commerce data', false),
  ('commerce.manage', 'Manage tenant commerce data', true),
  ('reports.read', 'Read tenant reports', false),
  ('reports.run', 'Run and export tenant reports', true),
  ('tenant.members.read', 'Read tenant members', false),
  ('tenant.members.manage', 'Invite and manage tenant members', true),
  ('tenant.config.manage', 'Manage tenant policy and branding', true),
  ('audit.read', 'Read tenant audit events', true),
  ('platform.manage', 'Provision and administer tenants', true)
on conflict (key) do update set
  description = excluded.description,
  requires_mfa = excluded.requires_mfa;

insert into public.roles (key, name, description, privileged) values
  ('worker', 'Worker', 'Requests PPE and views own custody', false),
  ('storekeeper', 'Storekeeper', 'Verifies pickup and issues stock', true),
  ('supervisor', 'Supervisor', 'Performs tier-one approvals', true),
  ('manager', 'Manager', 'Performs tier-two approvals and views reports', true),
  ('executive', 'Executive', 'Views operational and financial reporting', false),
  ('merchant', 'Merchant', 'Operates B2B commerce', true),
  ('tenant_admin', 'Tenant Admin', 'Manages members and tenant configuration', true),
  ('platform_owner', 'Platform Owner', 'Administers all tenants', true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  privileged = excluded.privileged;

with grants(role_key, capability_key) as (values
  ('worker', 'ppe.request.create'),
  ('storekeeper', 'ppe.stock.issue'),
  ('storekeeper', 'commerce.read'),
  ('supervisor', 'ppe.approve.tier1'),
  ('manager', 'ppe.approve.tier1'),
  ('manager', 'ppe.approve.tier2'),
  ('manager', 'reports.read'),
  ('manager', 'reports.run'),
  ('executive', 'reports.read'),
  ('merchant', 'commerce.read'),
  ('merchant', 'commerce.manage'),
  ('tenant_admin', 'tenant.members.read'),
  ('tenant_admin', 'tenant.members.manage'),
  ('tenant_admin', 'tenant.config.manage'),
  ('tenant_admin', 'reports.read'),
  ('tenant_admin', 'reports.run'),
  ('tenant_admin', 'audit.read'),
  ('platform_owner', 'platform.manage'),
  ('platform_owner', 'tenant.members.read'),
  ('platform_owner', 'tenant.members.manage'),
  ('platform_owner', 'tenant.config.manage'),
  ('platform_owner', 'audit.read'),
  ('platform_owner', 'commerce.read'),
  ('platform_owner', 'commerce.manage')
)
insert into public.role_capabilities(role_id, capability_id)
select r.id, c.id from grants g
join public.roles r on r.key = g.role_key
join public.capabilities c on c.key = g.capability_key
on conflict do nothing;

create or replace function public.is_platform_owner(check_user_id uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships m
    join membership_roles mr on mr.membership_id = m.id
    join roles r on r.id = mr.role_id
    where m.user_id = check_user_id and m.status = 'active' and r.key = 'platform_owner'
  );
$$;

create or replace function public.is_tenant_member(check_tenant_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_platform_owner(check_user_id) or exists (
    select 1 from memberships m
    where m.tenant_id = check_tenant_id and m.user_id = check_user_id and m.status = 'active'
  );
$$;

create or replace function public.has_capability(check_tenant_id uuid, capability_key text, check_user_id uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships m
    join membership_roles mr on mr.membership_id = m.id
    join role_capabilities rc on rc.role_id = mr.role_id
    join capabilities c on c.id = rc.capability_id
    where m.user_id = check_user_id
      and m.status = 'active'
      and (m.tenant_id = check_tenant_id or public.is_platform_owner(check_user_id))
      and c.key = capability_key
  );
$$;

-- Server-only scope resolver called by Medusa after JWT verification. It
-- derives roles/capabilities from canonical tables; request headers cannot add
-- privileges. Site access is validated against membership_sites.
create or replace function public.resolve_access_scope(
  p_user_id uuid,
  p_tenant_id uuid,
  p_site_id uuid default null
)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_tenant_member(p_tenant_id, p_user_id) then
    return null;
  end if;

  if p_site_id is not null and not exists (
    select 1 from sites s
    where s.id = p_site_id and s.tenant_id = p_tenant_id and s.status = 'active'
      and (
        public.is_platform_owner(p_user_id)
        or exists (
          select 1 from memberships m
          join membership_sites ms on ms.membership_id = m.id and ms.tenant_id = m.tenant_id
          where m.user_id = p_user_id and m.tenant_id = p_tenant_id
            and m.status = 'active' and ms.site_id = p_site_id
        )
      )
  ) then
    return null;
  end if;

  select jsonb_build_object(
    'user_id', p_user_id,
    'tenant_id', p_tenant_id,
    'site_id', p_site_id,
    'roles', coalesce(jsonb_agg(distinct r.key) filter (where r.key is not null), '[]'::jsonb),
    'capabilities', coalesce(jsonb_agg(distinct c.key) filter (where c.key is not null), '[]'::jsonb)
  ) into result
  from memberships m
  join membership_roles mr on mr.membership_id = m.id
  join roles r on r.id = mr.role_id
  left join role_capabilities rc on rc.role_id = r.id
  left join capabilities c on c.id = rc.capability_id
  where m.user_id = p_user_id and m.status = 'active'
    and (m.tenant_id = p_tenant_id or public.is_platform_owner(p_user_id));

  return result;
end;
$$;

revoke all on function public.is_platform_owner(uuid) from public;
revoke all on function public.is_tenant_member(uuid, uuid) from public;
revoke all on function public.has_capability(uuid, text, uuid) from public;
revoke all on function public.resolve_access_scope(uuid, uuid, uuid) from public;
grant execute on function public.is_platform_owner(uuid) to authenticated, service_role;
grant execute on function public.is_tenant_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.has_capability(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.resolve_access_scope(uuid, uuid, uuid) to service_role;

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.sites enable row level security;
alter table public.roles enable row level security;
alter table public.capabilities enable row level security;
alter table public.role_capabilities enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_sites enable row level security;
alter table public.membership_roles enable row level security;
alter table public.invitations enable row level security;
alter table public.tenant_branding enable row level security;
alter table public.feature_flags enable row level security;
alter table public.realtime_projections enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_select on public.profiles for select to authenticated
using (
  id = auth.uid() or public.is_platform_owner() or exists (
    select 1 from memberships mine join memberships theirs on theirs.tenant_id = mine.tenant_id
    where mine.user_id = auth.uid() and mine.status = 'active'
      and theirs.user_id = profiles.id and theirs.status = 'active'
  )
);
create policy profiles_update_self on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create policy tenants_select on public.tenants for select to authenticated
using (public.is_tenant_member(id));
create policy sites_select on public.sites for select to authenticated
using (public.is_tenant_member(tenant_id));
create policy roles_select on public.roles for select to authenticated using (true);
create policy capabilities_select on public.capabilities for select to authenticated using (true);
create policy role_capabilities_select on public.role_capabilities for select to authenticated using (true);

create policy memberships_select on public.memberships for select to authenticated
using (user_id = auth.uid() or public.has_capability(tenant_id, 'tenant.members.read'));
create policy membership_sites_select on public.membership_sites for select to authenticated
using (public.is_tenant_member(tenant_id));
create policy membership_roles_select on public.membership_roles for select to authenticated
using (exists (
  select 1 from memberships m where m.id = membership_id
    and (m.user_id = auth.uid() or public.has_capability(m.tenant_id, 'tenant.members.read'))
));

create policy invitations_select on public.invitations for select to authenticated
using (public.has_capability(tenant_id, 'tenant.members.read'));
create policy branding_select on public.tenant_branding for select to authenticated
using (public.is_tenant_member(tenant_id));
create policy feature_flags_select on public.feature_flags for select to authenticated
using (public.is_tenant_member(tenant_id));
create policy realtime_projections_select on public.realtime_projections for select to authenticated
using (public.is_tenant_member(tenant_id));
create policy audit_events_select on public.audit_events for select to authenticated
using (tenant_id is not null and public.has_capability(tenant_id, 'audit.read'));

-- The bucket is private. Object paths must start with the tenant UUID. Uploads
-- are allowed to authorized request creators; updates/deletes remain server-only.
insert into storage.buckets (id, name, public)
values ('ppe-private', 'ppe-private', false)
on conflict (id) do update set public = false;

create policy ppe_private_select on storage.objects for select to authenticated
using (
  bucket_id = 'ppe-private'
  and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
);
create policy ppe_private_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'ppe-private'
  and public.has_capability(((storage.foldername(name))[1])::uuid, 'ppe.request.create')
  and owner_id = auth.uid()::text
);

do $$
begin
  alter publication supabase_realtime add table public.realtime_projections;
exception when duplicate_object then null;
end $$;

comment on table public.realtime_projections is
  'Read-only Supabase mirror of Medusa domain events; Medusa remains authoritative.';
comment on function public.resolve_access_scope(uuid, uuid, uuid) is
  'Server-only tenant/site/RBAC resolver used after Supabase JWT verification.';
