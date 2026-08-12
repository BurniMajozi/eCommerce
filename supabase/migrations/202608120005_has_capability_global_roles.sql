-- has_capability() must honor tenant-independent platform authority the same way
-- resolve_access_scope() does (migration ...0004). Previously it only derived
-- capabilities from tenant memberships, so a membership-less platform owner was
-- denied every capability-gated RLS read policy (audit_events, invitations and
-- other members) even though the Medusa scope resolver granted those roles.

create or replace function public.has_capability(
  check_tenant_id uuid,
  capability_key text,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    -- Capabilities from the user's active membership in *this* tenant.
    select 1
    from memberships m
    join membership_roles mr on mr.membership_id = m.id
    join role_capabilities rc on rc.role_id = mr.role_id
    join capabilities c on c.id = rc.capability_id
    where m.user_id = check_user_id
      and m.status = 'active'
      and m.tenant_id = check_tenant_id
      and c.key = capability_key
    union all
    -- Capabilities from tenant-independent global platform roles.
    select 1
    from global_user_roles gur
    join role_capabilities rc on rc.role_id = gur.role_id
    join capabilities c on c.id = rc.capability_id
    where gur.user_id = check_user_id
      and public.is_platform_owner(check_user_id)
      and c.key = capability_key
  );
$$;

revoke all on function public.has_capability(uuid, text, uuid) from public, anon;
grant execute on function public.has_capability(uuid, text, uuid) to authenticated, service_role;

comment on function public.has_capability(uuid, text, uuid) is
  'Capability check honoring both this-tenant membership roles and tenant-independent global platform roles. Cross-tenant membership roles are intentionally not collected.';
