-- ============================================================================
-- Platform Owner writes (client-side, RLS-gated)
-- ----------------------------------------------------------------------------
-- The identity/tenancy schema was deliberately read-only for the browser
-- (mutations were expected to go through Medusa / a service role). The owner
-- portal now needs to perform a few real writes directly from the client.
-- This migration adds tightly-scoped INSERT/UPDATE policies — every one is
-- gated to is_platform_owner() or a specific tenant capability, so it is NOT
-- an open write path. Idempotent (CREATE POLICY IF NOT EXISTS is not portable,
-- so we guard with a existence check via DO blocks).
--
-- Run in the Supabase SQL Editor as `postgres` (can create policies on public).
-- ============================================================================

do $$
begin
  -- tenants: allow the platform owner to insert new tenants.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tenants' and policyname = 'tenants_platform_owner_insert'
  ) then
    create policy tenants_platform_owner_insert on public.tenants
      for insert to authenticated
      with check (public.is_platform_owner());
  end if;

  -- tenant_branding: allow platform owner (any tenant) or tenant.config.manage.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tenant_branding' and policyname = 'branding_owner_upsert'
  ) then
    create policy branding_owner_upsert on public.tenant_branding
      for insert to authenticated
      with check (public.is_platform_owner() or public.has_capability(tenant_id, 'tenant.config.manage'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tenant_branding' and policyname = 'branding_owner_update'
  ) then
    create policy branding_owner_update on public.tenant_branding
      for update to authenticated
      using (public.is_platform_owner() or public.has_capability(tenant_id, 'tenant.config.manage'))
      with check (public.is_platform_owner() or public.has_capability(tenant_id, 'tenant.config.manage'));
  end if;

  -- invitations: allow platform owner or tenant.members.manage to invite.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'invitations' and policyname = 'invitations_owner_insert'
  ) then
    create policy invitations_owner_insert on public.invitations
      for insert to authenticated
      with check (public.is_platform_owner() or public.has_capability(tenant_id, 'tenant.members.manage'));
  end if;

  -- membership_roles: allow platform owner or tenant.members.manage to assign.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'membership_roles' and policyname = 'membership_roles_owner_write'
  ) then
    create policy membership_roles_owner_write on public.membership_roles
      for insert to authenticated
      with check (
        exists (
          select 1 from memberships m
          where m.id = membership_id
            and (public.is_platform_owner() or public.has_capability(m.tenant_id, 'tenant.members.manage'))
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'membership_roles' and policyname = 'membership_roles_owner_delete'
  ) then
    create policy membership_roles_owner_delete on public.membership_roles
      for delete to authenticated
      using (
        exists (
          select 1 from memberships m
          where m.id = membership_id
            and (public.is_platform_owner() or public.has_capability(m.tenant_id, 'tenant.members.manage'))
        )
      );
  end if;

  -- audit_events: allow platform owner or tenant.admin to record audit rows.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_events' and policyname = 'audit_events_owner_insert'
  ) then
    create policy audit_events_owner_insert on public.audit_events
      for insert to authenticated
      with check (public.is_platform_owner() or (tenant_id is not null and public.has_capability(tenant_id, 'tenant.admin')));
  end if;
end $$;
