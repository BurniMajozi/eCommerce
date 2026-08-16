-- ============================================================================
-- Provision a user with a role — run in Supabase Dashboard → SQL Editor.
--
-- Prerequisite: the person already exists in Supabase Auth
--   (Dashboard → Authentication → Users → Add user / Invite; set a password).
--   This script never creates the auth user or a password.
--
-- Edit vv_email + vv_role, then run. Re-running is idempotent.
-- Roles: worker | storekeeper | supervisor | manager | executive | merchant
--        | tenant_admin | platform_owner
--   worker        → Request PPE only
--   supervisor    → Approvals (tier-1)
--   manager       → Approvals (tier-1&2) + Dashboard
--   storekeeper   → Store Counter + read commerce
--   executive     → Dashboard
--   merchant      → Commerce (B2B, Products, Inventory, Orders, Promotions,
--                   Tax, Fulfilment, CSV, Customers, Workflows, Event Bus)
--   tenant_admin  → Tenant Admin (members, config, reports, audit)
--   platform_owner→ everything, all tenants
--
-- NOTE: privileged roles (everything except worker/executive) need the user to
-- also enrol 2FA in the app (they will be prompted at login) to actually use
-- MFA-gated actions (commerce.manage, approvals tier-2, stock issue, etc.).
-- ============================================================================

do $$
declare
  -- ==== EDIT ME ==========================================================
  vv_email   text := 'worker1@example.com';   -- invited Auth user's email
  vv_name    text := 'Test Worker';
  vv_role    text := 'worker';                 -- see role list above
  -- Tenant/site to scope the membership to (CageLi merchant tenant by default).
  vv_tenant  uuid := '3d61522d-3804-4709-845b-832424c95163';
  vv_site    uuid := '8a0fab8c-893f-499e-8152-24e2d74111f4';
  -- ======================================================================

  v_user_id       uuid;
  v_membership_id uuid;
  v_role_id       uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(vv_email);
  if v_user_id is null then
    raise exception 'No auth.users row for %. Invite the user first (Authentication → Users), then re-run.', vv_email;
  end if;

  select id into v_role_id from public.roles where key = vv_role;
  if v_role_id is null then
    raise exception 'Unknown role "%". Valid: worker, storekeeper, supervisor, manager, executive, merchant, tenant_admin, platform_owner.', vv_role;
  end if;

  insert into public.profiles (id, display_name, status)
  values (v_user_id, vv_name, 'active')
  on conflict (id) do update set display_name = excluded.display_name, status = 'active';

  -- platform_owner is a tenant-independent GLOBAL role.
  if vv_role = 'platform_owner' then
    insert into public.global_user_roles (user_id, role_id, granted_by)
    values (v_user_id, v_role_id, v_user_id)
    on conflict (user_id, role_id) do nothing;
    raise notice 'Granted platform_owner to % (global).', vv_email;
    return;
  end if;

  -- Everyone else gets a tenant membership + role + site scope.
  select id into v_membership_id from public.memberships where tenant_id = vv_tenant and user_id = v_user_id;
  if v_membership_id is null then
    insert into public.memberships (tenant_id, user_id, status)
    values (vv_tenant, v_user_id, 'active')
    returning id into v_membership_id;
  else
    update public.memberships set status = 'active' where id = v_membership_id;
  end if;

  insert into public.membership_roles (membership_id, role_id)
  values (v_membership_id, v_role_id)
  on conflict do nothing;

  insert into public.membership_sites (membership_id, site_id, tenant_id)
  values (v_membership_id, vv_site, vv_tenant)
  on conflict do nothing;

  raise notice 'Provisioned % as % in tenant % (site %).', vv_email, vv_role, vv_tenant, vv_site;
end $$;

-- Verify what a user resolves to (edit the email):
select p.display_name, r.key as role, c.key as capability
from auth.users u
join public.profiles p on p.id = u.id
left join public.memberships m on m.user_id = u.id
left join public.membership_roles mr on mr.membership_id = m.id
left join public.global_user_roles gur on gur.user_id = u.id
left join public.roles r on r.id = coalesce(mr.role_id, gur.role_id)
left join public.role_capabilities rc on rc.role_id = r.id
left join public.capabilities c on c.id = rc.capability_id
where lower(u.email) = lower('worker1@example.com')
order by r.key, c.key;
