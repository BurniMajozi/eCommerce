-- ============================================================================
-- Medusa database isolation (one-time). Run as `postgres` in the Supabase SQL
-- Editor. Creates a private `medusa` schema and a least-privilege login role so
-- Medusa's ORM can own its commerce tables while remaining unable to touch the
-- public identity/tenancy tables (RLS would block it anyway).
--
-- `medusa` is intentionally NOT in the Data API exposed schemas
-- (see supabase/config.toml → [api].schemas = public, storage, graphql_public).
--
-- Idempotent. EDIT the password before running.
-- ============================================================================

-- 1. Private schema for Medusa's own tables.
create schema if not exists medusa;

-- 2. Dedicated login role. Use a strong, unique password (>= 24 random chars);
--    keep it only in the deploy host's secret store, never in git or VITE_*.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'medusa_app') then
    execute format('create role medusa_app login password %L', 'REPLACE_WITH_A_STRONG_PASSWORD');
  end if;
end
$$;

-- 3. Full control of the `medusa` schema, and nothing else. Medusa connects as
--    medusa_app and CREATEs/owns its tables here, so it implicitly holds all
--    rights on objects it creates; these grants cover the schema itself.
grant usage, create on schema medusa to medusa_app;

-- 4. Allow calling built-in / extension functions, but grant NO privileges on
--    public tables. The identity/tenancy data stays isolated from Medusa.
grant usage on schema public to medusa_app;
grant usage on schema extensions to medusa_app;   -- Supabase installs extensions here
revoke create on schema public from medusa_app;

-- 5. Default the role's search_path to its own schema.
alter role medusa_app in database postgres set search_path = medusa, public, extensions;

-- Verify:
select rolname, rolcanlogin from pg_roles where rolname = 'medusa_app';
select nspname from pg_namespace where nspname = 'medusa';

-- ---------------------------------------------------------------------------
-- Build DATABASE_URL for the Medusa service from Supabase → Project Settings →
-- Database → Connection string → *Session pooler*, then swap the user/password:
--
--   postgresql://medusa_app.<PROJECT_REF>:<PASSWORD>@<POOLER_HOST>:5432/postgres?sslmode=require
--
-- For this project PROJECT_REF = ppkvrqdatjzriatudblw. Use the Session pooler
-- (persistent server), not the Transaction pooler.
--
-- Undo (non-prod):  drop schema medusa cascade;  drop role medusa_app;
-- ---------------------------------------------------------------------------
