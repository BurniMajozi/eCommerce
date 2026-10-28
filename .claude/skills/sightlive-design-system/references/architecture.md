# Architecture — data model, capabilities/MFA, routes, deploy

## Two databases (keep them straight)
1. **Medusa Postgres, schema `medusa`** — the commerce/ops tables the app writes:
   `purchase_orders`, `store_orders`, `product_promotions`, `bug_reports`,
   `platform_invoices`, `login_prefs`. Query with knex inside a route:
   ```ts
   const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
   const rows = await db('purchase_orders').where({ tenant_id: scope.tenantId });
   ```
   Product/inventory/order entities come from Medusa's own modules via
   `req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity, fields, filters })`.
2. **Supabase `public`** — identity & governance: `profiles`, `memberships`,
   `membership_roles`, `membership_sites`, `roles`, `capabilities`,
   `role_capabilities`, `tenants`, `sites`, `audit_events`. Query with the
   service-role client:
   ```ts
   import { getServiceClient } from '../../../security/supabase-scope-resolver';
   const { data } = await getServiceClient().from('audit_events')
     .select('…').eq('tenant_id', scope.tenantId);
   ```
   The Medusa DB role **cannot** run DDL on `public`. Apply schema/seed changes
   with a node script run via `railway run --service Medusa -- node <script>`
   (service-role key from env), or add idempotent
   `alter table if exists … add column if not exists …` to the pre-deploy
   `bootstrap:store:direct` (`backend/scripts/bootstrap-store-db.mjs`).

## Capabilities & MFA
- Every membership resolves to a set of capability keys (roles →
  `role_capabilities` → `capabilities`). Some capabilities carry
  `requires_mfa = true` (e.g. `commerce.manage`, `reports.run`, `audit.read`,
  `ppe.stock.issue`) — those need an **aal2 (authenticator/TOTP)** session.
  Cost/profit data is MFA-protected and renders `Restricted` at aal1.
- **Backend gating** (`backend/src/security/tenant-scope`):
  - `assertCapability(scope, cap)` — 403 unless the user has `cap`; if `cap` is
    MFA-flagged (or you pass `true` as the 3rd arg) it also requires aal2.
  - `assertAnyCapability(scope, [caps])` — passes if the user has ANY of them
    (does not force MFA).
  Routes throw `ScopeError(status, code, message)`; catch and `res.status().json({code,message})`.
- **Contextual step-up (client):** a protected read that 403s with
  `code: 'mfa_required'` should surface a "Verify with authenticator" affordance
  that dispatches `window.dispatchEvent(new CustomEvent('sightlive:mfa-required'))`.
  `MfaStepUp.jsx` runs the TOTP challenge and, on success, dispatches
  `'sightlive:mfa-elevated'`. Components/`AppContext` listen for that event to
  refetch the now-unlocked data. (`AppContext` bumps its catalogue/profit reload
  key on `mfa-elevated`.)

## Nav gating (adding a screen)
`src/components/Sidebar.jsx` → `NAV_GROUPS`: each item is
`{ id, label, icon, cap }` (or `capAny: [cap1, cap2]` for "visible if the user
has any"). `visibleNavGroups(tenantAccess)` filters by resolved capabilities;
platform owners / demo mode see everything. Grant a role the capability and the
nav item appears automatically — no routing edits beyond mapping the `id` to a
portal/view in `App.jsx`.

## API routes
Medusa file-based routing under `backend/src/api/app/…/route.ts` — export
`GET`/`POST`/`PATCH` and it's auto-registered at that path. Requests are
tenant-scoped by middleware (`req.tenantScope` → `{ userId, tenantId, siteId,
capabilities, mfaCapabilities }`). The frontend calls them through
`src/catalogue/catalogueClient.js` (`scopedJson(path, scope)` adds the
`Authorization: Bearer`, `X-Tenant-ID`, `X-Site-ID` headers and, on a `403
mfa_required` for a write, fires the step-up event).

## Demo mode & env
- `VITE_DEMO_MODE=true` → `isSupabaseConfigured` false → login bypassed, every
  panel renders with mock data (`src/data/mockData.js`). Best way to smoke-test UI.
- Live mode needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `VITE_MEDUSA_BASE_URL`, `VITE_MEDUSA_CATALOGUE_ENABLED=true`. Backend secrets
  (`SUPABASE_SERVICE_ROLE_KEY`, `AGENTMAIL_API_KEY`, `PAYSTACK_SECRET_KEY`, hook
  secrets) are set by the user as env vars — never hardcode or print them.

## Deploying (Railway) — only when asked
- Services: `eCommerce` (frontend) and `Medusa` (backend), both from GitHub
  `BurniMajozi/eCommerce` main. Auto-deploy is unreliable — deploy explicitly.
- **`railway up --service <eCommerce|Medusa> --detach` FROM THE REPO ROOT.** The
  Medusa service builds `backend/Dockerfile` with root-dir `backend`; running
  `railway up` from inside `backend/` nests the context and fails the build.
- Medusa runs `preDeployCommand: bootstrap:store:direct` before boot. Deploys can
  stall in `INITIALIZING` (Railway-side, no error) while the old container keeps
  serving — clear it by re-triggering a fresh `railway up`.
- Check status with `railway status --json` and parse each service's
  `latestDeployment.status` (SUCCESS / BUILDING / DEPLOYING / FAILED). Don't rely
  on log-grepping. Confirm the served bundle/endpoint actually changed before
  calling a deploy done.
- Before deploying: `npm run build`, `npm --prefix backend run typecheck`,
  `npm test`; smoke-test UI in demo mode.
