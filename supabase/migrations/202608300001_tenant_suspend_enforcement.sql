-- Enforce tenant suspension. resolve_access_scope previously gated on membership
-- and site status but NOT the tenant's own status, so a suspended tenant's users
-- kept full access. This redefinition denies scope for any tenant that is not
-- 'active' (suspended / closed) — EXCEPT platform owners, who must still be able
-- to view and reactivate it. Everything else is identical to 202608120006.

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

  -- NEW: a non-active tenant (suspended/closed) grants no scope to its members.
  -- Platform owners are exempt so they can manage and reactivate it.
  if not public.is_platform_owner(p_user_id)
     and not exists (
       select 1 from tenants t where t.id = p_tenant_id and t.status = 'active'
     ) then
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

  with effective_role_ids as (
    select mr.role_id
    from memberships m
    join membership_roles mr on mr.membership_id = m.id
    where m.user_id = p_user_id
      and m.tenant_id = p_tenant_id
      and m.status = 'active'

    union

    select gur.role_id
    from global_user_roles gur
    where gur.user_id = p_user_id
      and public.is_platform_owner(p_user_id)
  )
  select jsonb_build_object(
    'user_id', p_user_id,
    'tenant_id', p_tenant_id,
    'site_id', p_site_id,
    'roles', coalesce(jsonb_agg(distinct r.key) filter (where r.key is not null), '[]'::jsonb),
    'capabilities', coalesce(jsonb_agg(distinct c.key) filter (where c.key is not null), '[]'::jsonb),
    'mfa_capabilities', coalesce(jsonb_agg(distinct c.key) filter (where c.key is not null and c.requires_mfa), '[]'::jsonb)
  ) into result
  from effective_role_ids eri
  join roles r on r.id = eri.role_id
  left join role_capabilities rc on rc.role_id = r.id
  left join capabilities c on c.id = rc.capability_id;

  return result;
end;
$$;

revoke all on function public.resolve_access_scope(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.resolve_access_scope(uuid, uuid, uuid) to service_role;

comment on function public.resolve_access_scope(uuid, uuid, uuid) is
  'Server-only immutable tenant scope. Denies non-owner access to non-active tenants (suspension). Returns roles, capabilities, and MFA-required capabilities.';
