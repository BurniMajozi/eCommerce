# Phase 1 architecture

## System boundaries

| System | Canonical responsibilities | Must not own |
|---|---|---|
| React/Vite | Presentation, filters, active navigation, temporary form state, demo fallback | Authorization decisions, authoritative totals, stock mutations, secrets |
| Supabase | Auth, profiles, tenants, sites, memberships, RBAC, invitations, branding, feature flags, private files, read-only Realtime projections | Commerce, inventory, PPE transactions, quotations |
| Medusa | Products, variants, pricing, customers, inventory, reservations, stock locations, sales channels, orders, payments, fulfilment and future PPE/quote modules | Human identity or browser-direct tenant authorization |

A tenant is a customer/company. Sites and plants belong to a tenant. A shared
Medusa deployment is used initially, so every custom route must resolve an
immutable tenant/site scope before any application service is invoked.

Global platform authority is stored in `global_user_roles`, independently of
tenant membership. Global brand and white-label configuration is stored in the
singleton `platform_settings` row. A platform owner does not require a dummy
tenant or site.

## Request trust boundary

1. The browser authenticates with Supabase and sends the short-lived access JWT.
2. The browser sends `X-Tenant-ID` and optionally `X-Site-ID`; these are requests,
   not trusted claims.
3. Medusa verifies the JWT signature, issuer and audience against Supabase JWKS.
4. Medusa calls the server-only `resolve_access_scope` RPC with the verified
   subject and requested scope. The RPC derives roles/capabilities from canonical
   membership records.
5. Middleware freezes the resolved scope on the request. Capability guards and
   workflows use this server-derived object.
6. Privileged capabilities require a JWT with `aal2` (MFA).

All routes under `/app/*` are protected by this middleware. Future custom PPE,
quote, report, import and administration endpoints must live under this prefix
or register the same middleware explicitly.

## Tenant-to-commerce links

The Medusa `tenantLink` module stores identifiers that connect a Supabase tenant
to Medusa sales channels and regions. Site links connect Supabase sites to stock
locations and optional sales channels. These IDs support filtering and module
links; metadata alone must never be used as the authorization check.

## Realtime and files

Medusa remains authoritative. After a transaction commits, a subscriber will
upsert an idempotent record into `realtime_projections`; clients may select and
subscribe through RLS but cannot write projection rows. Missed events must be
recoverable by refetching the Medusa API.

The `ppe-private` bucket is private and paths begin with the tenant UUID. Phase 1
allows authorized request creators to upload new objects; updates and deletes
remain server-only. Signed downloads and retention rules are added with the PPE
workflow, not in the demo UI.

## Data intentionally not implemented in Phase 1

- PPE request, approval, entitlement, custody, pickup, issue and return models.
- Quote, quote version, credit limit and fiscal invoice models/workflows.
- Live product, price, inventory or reporting reads in the React screens.
- Medusa-to-Supabase projection writers and external providers.
- Offline mutation synchronization.

The existing mock React Context remains the application data path until each
later vertical slice is transactional and tested end to end.
