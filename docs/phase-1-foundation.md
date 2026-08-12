# Phase 1 foundation setup

## Prerequisites

- Node.js 20, 22 or 24 LTS and npm. Node.js 25+ is not currently targeted by
  this Medusa scaffold.
- PostgreSQL for Medusa. Use a separate database/schema from Supabase-managed
  identity data unless an explicitly reviewed deployment design says otherwise.
- Redis for Medusa event/workflow infrastructure.
- A Supabase project (hosted or local CLI).

## Frontend

1. Copy `.env.example` to `.env.local`.
2. Set only `VITE_SUPABASE_URL` and the Supabase **publishable** key.
3. Run `npm install` and `npm run dev`.

If those values are absent, `AuthSessionProvider` and `TenantAccessProvider`
select `demo` mode and preserve all current mock behavior. Never add a secret or
service-role key to a `VITE_*` variable; Vite publishes those values.

The new integration objects are exposed through the existing `useApp()` value:

- `auth`: session/user state and sign-in/sign-out functions.
- `tenantAccess`: server/RLS-filtered memberships, tenants, sites, roles and
  capabilities, plus active scope selectors.
- `integrationMode`: `demo` or `supabase`.

The current pages do not yet switch their business reads or writes to these
objects. That is deliberate until the matching Medusa workflows exist.

## Supabase database

Apply `supabase/migrations/202608120001_phase1_identity_tenancy.sql` using the
Supabase CLI migration workflow. The migration creates:

- profiles, tenants and subordinate sites;
- memberships, membership-to-site scope, roles, capabilities and grants;
- invitations, branding and feature flags;
- read-only Realtime projections and append-only audit metadata;
- helper functions and RLS policies;
- a private `ppe-private` Storage bucket; and
- baseline application roles/capabilities.

After applying it, create users through Supabase Auth and provision the first
tenant/membership/role using a trusted SQL session or server-only administrative
function. No browser policy permits self-provisioning or privilege escalation.

The `resolve_access_scope` function is executable only by `service_role`. It is
used by Medusa after JWT verification and must not be exposed through client code.

## Medusa backend

1. Copy `backend/.env.example` to `backend/.env` and replace all placeholder
   secrets. Keep the Supabase service-role value server-side.
2. Start PostgreSQL and Redis.
3. Run `npm --prefix backend install`.
4. Generate the tenant-link module migration with
   `npm --prefix backend run db:generate`, review it, then run
   `npm --prefix backend run db:migrate`.
5. Start Medusa with `npm run dev:backend`.

The protected diagnostic endpoint is `GET /app/context`. It requires:

```http
Authorization: Bearer <supabase-access-token>
X-Tenant-ID: <tenant-uuid>
X-Site-ID: <optional-site-uuid>
```

It returns only the resolved user, tenant/site, roles, capabilities and MFA
assurance level. A mismatched membership/site is denied. Future privileged
routes must also use `requireTenantCapability(capability, { mfa: true })`.

Supabase projects using legacy symmetric JWT signing should migrate to asymmetric
signing keys so the backend can validate tokens through JWKS. Do not substitute
client-decoded claims for signature verification.

## Validation

Run from the repository root:

```bash
npm run lint
npm run build
npm test
npm run build:backend
```

The backend unit tests require no database, Redis, Supabase project or secrets.
They validate cross-tenant denial, site scoping, capability checks, MFA checks
and immutable request scope construction. Full RLS integration tests should be
added once a disposable local Supabase stack is part of CI.

## Next implementation slice

Seed tenant/site links and Medusa products/variants/prices/locations, then replace
catalogue and inventory reads before implementing the PPE request workflow.

Before bootstrap, review [first-tenant-bootstrap.md](first-tenant-bootstrap.md)
and [medusa-supabase-runtime.md](medusa-supabase-runtime.md). They list the
identity choices and server-only database/Redis credentials still required.
