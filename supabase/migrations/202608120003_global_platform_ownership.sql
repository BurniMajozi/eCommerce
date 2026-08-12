-- Platform owners exist above tenant scope. They must not require a dummy
-- tenant membership. Platform branding is likewise global, not tenant-owned.

create table public.global_user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  primary key (user_id, role_id)
);

create table public.platform_settings (
  singleton boolean primary key default true check (singleton),
  brand_name text not null,
  white_label_enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create or replace function public.is_platform_owner(check_user_id uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from global_user_roles gur
    join roles r on r.id = gur.role_id
    where gur.user_id = check_user_id and r.key = 'platform_owner'
  );
$$;

revoke all on function public.is_platform_owner(uuid) from public, anon;
grant execute on function public.is_platform_owner(uuid) to authenticated, service_role;

alter table public.global_user_roles enable row level security;
alter table public.platform_settings enable row level security;

create policy global_user_roles_select on public.global_user_roles
for select to authenticated
using (user_id = auth.uid() or public.is_platform_owner());

create policy platform_settings_select on public.platform_settings
for select to authenticated
using (public.is_platform_owner());

-- Writes remain trusted-server/SQL-only. No authenticated insert, update, or
-- delete policies are intentionally created for either table.

comment on table public.global_user_roles is
  'Tenant-independent platform authority; platform_owner must be granted here.';
comment on table public.platform_settings is
  'Singleton global brand and white-label configuration, separate from tenant branding.';
