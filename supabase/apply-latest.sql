-- ============================================================================
-- SightLive — finish setup in one paste.
-- Run in the Supabase Dashboard → SQL Editor (executes as `postgres`, so it
-- bypasses RLS and may write these tables). Safe/idempotent to re-run.
--
-- Assumes the base schema (migrations 202608120001 + 202608120003) is already
-- applied — confirmed: profiles/tenants/sites/memberships/global_user_roles
-- all exist in this project.
--
-- Part A brings the security functions to the PR versions (has_capability +
-- resolve_access_scope now honor global platform roles, and the scope carries
-- MFA-required capabilities). Part B locks down execute grants. Part C seeds
-- your first tenant + admin. EDIT the vv_ block in Part C before running.
-- ============================================================================


-- ─── Part A · security functions (idempotent CREATE OR REPLACE) ─────────────

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
    select 1
    from global_user_roles gur
    join role_capabilities rc on rc.role_id = gur.role_id
    join capabilities c on c.id = rc.capability_id
    where gur.user_id = check_user_id
      and public.is_platform_owner(check_user_id)
      and c.key = capability_key
  );
$$;

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

  with effective_role_ids as (
    select mr.role_id
    from memberships m
    join membership_roles mr on mr.membership_id = m.id
    where m.user_id = p_user_id and m.tenant_id = p_tenant_id and m.status = 'active'
    union
    select gur.role_id
    from global_user_roles gur
    where gur.user_id = p_user_id and public.is_platform_owner(p_user_id)
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


-- ─── Part B · execute grants (lockdown) ─────────────────────────────────────

revoke execute on function public.is_platform_owner(uuid) from public, anon;
revoke execute on function public.is_tenant_member(uuid, uuid) from public, anon;
revoke execute on function public.has_capability(uuid, text, uuid) from public, anon;
revoke execute on function public.resolve_access_scope(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_platform_owner(uuid) to authenticated, service_role;
grant execute on function public.is_tenant_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.has_capability(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.resolve_access_scope(uuid, uuid, uuid) to service_role;


-- ─── Part C · first-tenant seed ─────────────────────────────────────────────
-- EDIT the vv_ values, then run. The admin email must already exist in
-- Supabase Auth (Dashboard → Authentication → Users → Invite) before running.

do $$
declare
  -- ==== EDIT ME ==========================================================
  vv_admin_email          text    := 'burnibraai@gmail.com';   -- invited Auth user
  vv_display_name         text    := 'Burni Majozi';
  vv_tenant_name          text    := 'Kumba Iron Ore';
  vv_tenant_slug          text    := 'kumba';                  -- lowercase, hyphens
  vv_site_name            text    := 'Plant Alpha';
  vv_site_code            text    := 'ALPHA';
  vv_department           text    := 'Plant Operations';
  vv_grant_platform_owner boolean := true;
  vv_brand_name           text    := 'SightLive';
  -- =======================================================================

  v_user_id uuid; v_tenant_id uuid; v_site_id uuid; v_membership_id uuid;
  v_admin_role_id uuid; v_owner_role_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(vv_admin_email);
  if v_user_id is null then
    raise exception 'No auth.users row for %. Invite the user first, then re-run Part C.', vv_admin_email;
  end if;

  insert into public.profiles (id, display_name, status)
  values (v_user_id, vv_display_name, 'active')
  on conflict (id) do update set display_name = excluded.display_name, status = 'active';

  select id into v_tenant_id from public.tenants where slug = vv_tenant_slug;
  if v_tenant_id is null then
    insert into public.tenants (name, slug, status, plan_key)
    values (vv_tenant_name, vv_tenant_slug, 'active', 'trial') returning id into v_tenant_id;
  end if;

  select id into v_site_id from public.sites where tenant_id = v_tenant_id and code = vv_site_code;
  if v_site_id is null then
    insert into public.sites (tenant_id, name, code, status)
    values (v_tenant_id, vv_site_name, vv_site_code, 'active') returning id into v_site_id;
  end if;

  select id into v_membership_id from public.memberships where tenant_id = v_tenant_id and user_id = v_user_id;
  if v_membership_id is null then
    insert into public.memberships (tenant_id, user_id, status, department)
    values (v_tenant_id, v_user_id, 'active', vv_department) returning id into v_membership_id;
  else
    update public.memberships set status = 'active', department = vv_department where id = v_membership_id;
  end if;

  select id into v_admin_role_id from public.roles where key = 'tenant_admin';
  if v_admin_role_id is null then
    raise exception 'roles not seeded (tenant_admin missing). Re-apply migration ...0001.';
  end if;
  insert into public.membership_roles (membership_id, role_id)
  values (v_membership_id, v_admin_role_id) on conflict do nothing;

  insert into public.membership_sites (membership_id, site_id, tenant_id)
  values (v_membership_id, v_site_id, v_tenant_id) on conflict do nothing;

  insert into public.tenant_branding (tenant_id, accent_color, ink_color, ground_color, updated_by)
  values (v_tenant_id, '#EF5B0A', '#16181D', '#F4F5F7', v_user_id)
  on conflict (tenant_id) do nothing;

  if vv_grant_platform_owner then
    select id into v_owner_role_id from public.roles where key = 'platform_owner';
    insert into public.global_user_roles (user_id, role_id, granted_by)
    values (v_user_id, v_owner_role_id, v_user_id) on conflict (user_id, role_id) do nothing;

    insert into public.platform_settings (singleton, brand_name, white_label_enabled, updated_by)
    values (true, vv_brand_name, true, v_user_id)
    on conflict (singleton) do update set brand_name = excluded.brand_name, updated_by = excluded.updated_by;
  end if;

  raise notice 'Seed complete. tenant_id=%  site_id=%  (copy for the Medusa link step)', v_tenant_id, v_site_id;
end $$;

-- Quick verification (edit the slug to match vv_tenant_slug):
select t.slug, s.code, p.display_name, m.status,
       array_agg(distinct r.key) as roles,
       exists (select 1 from public.global_user_roles g join public.roles gr on gr.id = g.role_id
               where g.user_id = m.user_id and gr.key = 'platform_owner') as platform_owner
from public.tenants t
join public.sites s on s.tenant_id = t.id
join public.memberships m on m.tenant_id = t.id
join public.profiles p on p.id = m.user_id
join public.membership_roles mr on mr.membership_id = m.id
join public.roles r on r.id = mr.role_id
where t.slug = 'kumba'
group by t.slug, s.code, p.display_name, m.status, m.user_id;
