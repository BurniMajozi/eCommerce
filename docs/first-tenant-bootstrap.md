# First tenant and administrator bootstrap

No hosted records should be created until these user choices are supplied:

1. Administrator identity: either a real email for a Supabase Dashboard
   **Send invitation** (recommended), or an existing Supabase Auth user UUID.
   Direct password creation additionally requires a user-chosen temporary
   password and secure reset/delivery process; never place it in SQL or chat.
2. Administrator display name.
3. Tenant/company name and URL-safe tenant slug.
4. Initial site/plant name and unique site code.
5. Whether the first user receives only `tenant_admin` (recommended) or also
   the global `platform_owner` role.
6. Optional department and crew values.

After the Auth user exists, one reviewed transaction needs: `profiles`,
`tenants`, `sites`, an active `memberships` row, `membership_roles` linked to
the existing `tenant_admin` role, `membership_sites` linked to the initial
site, and optionally default `tenant_branding`. This does not create a Medusa
customer, product, stock location, or order.

The safe available creation surface is the signed-in Supabase Dashboard:
Authentication → Users for the invitation, followed by a parameterized SQL
transaction after the Auth UUID is known. The public frontend cannot bootstrap
tenants because RLS correctly blocks self-provisioning and role escalation.

The previously exposed personal access token must not be reused for this work.

## Runbook (concrete steps)

Two seed artifacts implement the above:

- `supabase/bootstrap/001_first_tenant.sql` — identity/tenancy seed (idempotent).
- `backend/src/scripts/bootstrap-links.ts` — links the tenant/site to Medusa
  commerce resources (run via `npm --prefix backend run bootstrap:links`).

**Prerequisites**: migrations `202608120001`–`202608120006` applied; Medusa
running against the shared Postgres with the `tenantLink` module migrated
(`npm --prefix backend run db:generate` then `db:migrate`); Redis configured.

1. **Invite the administrator.** Supabase Dashboard → Authentication → Users →
   *Invite*. The user accepts and sets their own password. No password is ever
   placed in SQL or chat.

2. **(For privileged actions) enrol MFA.** Reads over RLS work at `aal1`, but
   privileged Medusa capabilities (`platform.manage`, `commerce.manage`,
   `tenant.config.manage`, `audit.read`, …) are `requires_mfa` and now
   auto-enforce `aal2`. Enrol the admin in TOTP so their session can step up.

3. **Seed identity/tenancy.** Open `supabase/bootstrap/001_first_tenant.sql` in
   the Dashboard SQL Editor (runs as `postgres`, bypassing RLS). Edit the `v_*`
   values at the top, run it, and copy `SUPA_TENANT_ID` / `SUPA_SITE_ID` from
   the NOTICE output. The trailing SELECT confirms the tenant, site, roles and
   platform-owner flag.

4. **Create Medusa commerce resources.** In Medusa Admin create (or identify) a
   **Region**, a **Sales Channel**, and a **Stock Location** for this tenant/
   site. Note their IDs.

5. **Link them.** From `backend/`:

   ```bash
   SUPA_TENANT_ID=<uuid> SALES_CHANNEL_ID=<sc_...> DEFAULT_REGION_ID=<reg_...> \
   SUPA_SITE_ID=<uuid>   STOCK_LOCATION_ID=<sloc_...> \
   npm run bootstrap:links
   ```

   Omit `SUPA_SITE_ID`/`STOCK_LOCATION_ID` to link the tenant only (catalogue
   reads then run tenant-wide without a site inventory filter). Re-running
   updates the existing link.

6. **Verify the server scope.** With the admin's Supabase access token:

   ```http
   GET /app/context
   Authorization: Bearer <access-token>
   X-Tenant-ID: <SUPA_TENANT_ID>
   X-Site-ID:   <SUPA_SITE_ID>
   ```

   Expect the resolved `roles`, `capabilities`, `mfa_capabilities` and
   `assurance_level`. `GET /app/catalogue` returns `200` with an empty `items`
   list until products are published on the linked sales channel, or `409`
   (`tenant_commerce_link_required`) if step 5 was skipped.

7. **Enable the live frontend.** Set `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY` (and, for live catalogue,
   `VITE_MEDUSA_BASE_URL` + `VITE_MEDUSA_CATALOGUE_ENABLED=true`). Sign in as the
   admin: Platform Owner (tenants, audit) and Tenant Admin (users & roles) now
   render a **Live · RLS** badge instead of demo data.

**Undo (non-prod):** `delete from public.tenants where slug = '<slug>';` cascades
tenant rows; `delete from public.global_user_roles where user_id = '<uuid>';`
removes platform ownership; delete the Medusa link rows via the module.

