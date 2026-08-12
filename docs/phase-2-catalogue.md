# Phase 2 catalogue read slice

## Implemented contract

The frontend now has a server-authenticated catalogue boundary at
`GET /app/catalogue`. The browser sends its Supabase access token and requested
tenant/site IDs. Existing Medusa middleware verifies the JWT and resolves the
immutable membership scope before the route checks `commerce.read`.

The route refuses an unlinked tenant instead of returning an unscoped global
catalogue. It filters products by the tenant's Medusa sales channel and, when a
site is selected, queries inventory only for that site's linked stock location.
The response adapts Medusa products and variants to the current React catalogue
shape and reports missing imported metadata through `dataQuality`.

Required metadata for full parity with the current mock screens:

- product: `category`, `abc_class`, `lifespan_months`, `daily_consumption`,
  `lead_time_days`;
- standard Medusa variant prices provide `sellingPrice`;
- standard inventory items and location levels provide on-hand, reserved,
  available and incoming quantities.

Missing numeric values are represented as zero only to keep legacy components
type-safe and are explicitly listed in each item's `dataQuality.missing`; they
must not be interpreted as imported business facts.

Cost is deliberately excluded from `GET /app/catalogue`. The separate
`GET /app/catalogue/profit` contract reads private `cost_price` product/variant
metadata and calculates unit profit, margin and stock value on the server. It
requires `commerce.manage` and an `aal2` MFA session, so workers and ordinary
catalogue readers cannot retrieve cost or margin data.

## CSV validation workflow

The import screen now accepts CSV files up to 5 MB and sends them to
`POST /app/catalogue/import/validate`. The endpoint checks canonical columns,
duplicate SKUs, money fields, whole-number stock and negative-margin warnings,
returning row/column errors plus a ten-row preview. It is a dry run and always
returns `canImport: false`; it creates no products, prices or inventory.

`GET /app/catalogue/import/status` advertises the validation-only state and
limits. `GET /app/catalogue/import/template` downloads the header-only template.
All three routes require `commerce.manage` and MFA. A transactional import
workflow will be added only after Medusa PostgreSQL, tenant links and approved
source data exist.

## Demo and failure behavior

The React app attempts the Medusa read only when all of these are true:

1. `VITE_DEMO_MODE` is not `true`;
2. `VITE_MEDUSA_CATALOGUE_ENABLED=true`;
3. `VITE_MEDUSA_BASE_URL` is HTTPS, or HTTP localhost;
4. a Supabase access token exists; and
5. an active tenant scope exists.

Otherwise `CAGELI_PRODUCTS` remains the demo source. Once the live path is
explicitly enabled, a failed request exposes `catalogue.source = 'error'` and an
empty catalogue instead of presenting mock records as tenant facts. A successful
empty Medusa catalogue likewise remains empty.

## Runtime prerequisites still outstanding

- dedicated PostgreSQL role/password and connection URL for the private
  `medusa` schema;
- Redis URL (local or managed TLS) for shared/production worker mode;
- strong server-only Medusa JWT and cookie secrets;
- Supabase server credential for `resolve_access_scope` (never a `VITE_*`
  value);
- reviewed Medusa tenant/sales-channel and site/stock-location link records;
- approved product/variant/price/inventory import mapping and source data;
- a role decision for employee catalogue visibility: the current protected
  contract requires `commerce.read`, which is not granted to `worker`;
- deployment host, domains/CORS and secret-store decisions.

No database migration, product seed, tenant link or external resource is
created by the local catalogue/import slice. Supabase tenant/site bootstrap is
tracked separately from Medusa commerce data.
