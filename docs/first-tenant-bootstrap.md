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
