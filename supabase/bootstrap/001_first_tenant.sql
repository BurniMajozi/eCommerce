-- ============================================================================
-- First-tenant bootstrap (one-time seed — NOT a migration).
--
-- Run ONCE per environment in a TRUSTED server SQL session (Supabase Dashboard
-- → SQL Editor, which executes as the table-owning `postgres` role and so
-- bypasses RLS). Never run from the browser: RLS intentionally blocks
-- self-provisioning and role escalation, and there is no INSERT policy for
-- `authenticated`.
--
-- Prerequisites:
--   * migrations 202608120001..202608120006 already applied;
--   * the administrator already exists in Supabase Auth (Dashboard →
--     Authentication → Users → Invite). This script never creates the auth
--     user or a password.
--
-- Idempotent: re-running with the same values makes no duplicate rows.
-- Edit the v_* values below, run, then copy the two IDs from the NOTICE output
-- into the Medusa link step (backend/src/scripts/bootstrap-links.ts).
-- ============================================================================

do $$
declare
  -- ---- EDIT THESE ---------------------------------------------------------
  v_admin_email          text    := 'admin@example.com';   -- invited Auth user's email
  v_display_name         text    := 'Platform Administrator';
  v_tenant_name          text    := 'Kumba Iron Ore';
  v_tenant_slug          text    := 'kumba';                -- lowercase, hyphen-separated
  v_site_name            text    := 'Plant Alpha';
  v_site_code            text    := 'ALPHA';                -- unique within the tenant
  v_department           text    := 'Plant Operations';
  v_crew                 text    := null;
  v_grant_platform_owner boolean := true;                   -- also grant tenant-independent platform ownership?
  v_brand_name           text    := 'SightLive';
  -- ------------------------------------------------------------------------

  v_user_id       uuid;
  v_tenant_id     uuid;
  v_site_id       uuid;
  v_membership_id uuid;
  v_admin_role_id uuid;
  v_owner_role_id uuid;
begin
  -- 1. Resolve the pre-created Auth user by email.
  select id into v_user_id from auth.users where lower(email) = lower(v_admin_email);
  if v_user_id is null then
    raise exception 'No auth.users row for %. Invite the user first (Dashboard → Authentication → Users), then re-run.', v_admin_email;
  end if;

  -- 2. Profile (profiles.id references auth.users.id).
  insert into public.profiles (id, display_name, status)
  values (v_user_id, v_display_name, 'active')
  on conflict (id) do update set display_name = excluded.display_name, status = 'active';

  -- 3. Tenant (idempotent by unique slug).
  select id into v_tenant_id from public.tenants where slug = v_tenant_slug;
  if v_tenant_id is null then
    insert into public.tenants (name, slug, status, plan_key)
    values (v_tenant_name, v_tenant_slug, 'active', 'trial')
    returning id into v_tenant_id;
  end if;

  -- 4. Site (idempotent by tenant_id + code).
  select id into v_site_id from public.sites where tenant_id = v_tenant_id and code = v_site_code;
  if v_site_id is null then
    insert into public.sites (tenant_id, name, code, status)
    values (v_tenant_id, v_site_name, v_site_code, 'active')
    returning id into v_site_id;
  end if;

  -- 5. Membership (idempotent by tenant_id + user_id).
  select id into v_membership_id from public.memberships where tenant_id = v_tenant_id and user_id = v_user_id;
  if v_membership_id is null then
    insert into public.memberships (tenant_id, user_id, status, department, crew)
    values (v_tenant_id, v_user_id, 'active', v_department, v_crew)
    returning id into v_membership_id;
  else
    update public.memberships set status = 'active', department = v_department, crew = v_crew where id = v_membership_id;
  end if;

  -- 6. Grant the tenant_admin role to the membership.
  select id into v_admin_role_id from public.roles where key = 'tenant_admin';
  if v_admin_role_id is null then
    raise exception 'Seed roles missing (tenant_admin). Apply migration ...0001 first.';
  end if;
  insert into public.membership_roles (membership_id, role_id)
  values (v_membership_id, v_admin_role_id)
  on conflict do nothing;

  -- 7. Scope the membership to the initial site.
  insert into public.membership_sites (membership_id, site_id, tenant_id)
  values (v_membership_id, v_site_id, v_tenant_id)
  on conflict do nothing;

  -- 8. Default tenant branding (SightLive orange).
  insert into public.tenant_branding (tenant_id, accent_color, ink_color, ground_color, updated_by)
  values (v_tenant_id, '#EF5B0A', '#16181D', '#F4F5F7', v_user_id)
  on conflict (tenant_id) do nothing;

  -- 9. Optional: tenant-independent platform ownership + singleton settings.
  if v_grant_platform_owner then
    select id into v_owner_role_id from public.roles where key = 'platform_owner';
    insert into public.global_user_roles (user_id, role_id, granted_by)
    values (v_user_id, v_owner_role_id, v_user_id)
    on conflict (user_id, role_id) do nothing;

    insert into public.platform_settings (singleton, brand_name, white_label_enabled, updated_by)
    values (true, v_brand_name, true, v_user_id)
    on conflict (singleton) do update set brand_name = excluded.brand_name, updated_by = excluded.updated_by;
  end if;

  raise notice 'Bootstrap complete.';
  raise notice 'admin user_id = %', v_user_id;
  raise notice 'Copy for the Medusa link step:  SUPA_TENANT_ID=%  SUPA_SITE_ID=%', v_tenant_id, v_site_id;
end $$;

-- Verification (safe to re-run). Edit the slug to match v_tenant_slug above.
select
  t.id   as tenant_id,
  t.slug,
  s.id   as site_id,
  s.code as site_code,
  p.display_name,
  m.status as membership_status,
  array_agg(distinct r.key) as tenant_roles,
  exists (
    select 1 from public.global_user_roles gur
    join public.roles gr on gr.id = gur.role_id
    where gur.user_id = m.user_id and gr.key = 'platform_owner'
  ) as is_platform_owner
from public.tenants t
join public.sites s          on s.tenant_id = t.id
join public.memberships m    on m.tenant_id = t.id
join public.profiles p       on p.id = m.user_id
join public.membership_roles mr on mr.membership_id = m.id
join public.roles r          on r.id = mr.role_id
where t.slug = 'kumba'   -- << match v_tenant_slug
group by t.id, t.slug, s.id, s.code, p.display_name, m.status, m.user_id;
