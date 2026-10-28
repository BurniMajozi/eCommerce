# SightLive / CageLi — project guide for Codex

PPE B2B stock-management platform for South African mining. When you build UI or
touch the backend, follow the conventions below so new code matches what's here.

## Stack & layout
- **Frontend**: React + Vite + Tailwind, but with a **hand-rolled design system** (not shadcn). Entry at repo root; source in `src/`. Icons: **lucide-react**.
- **Backend**: Medusa v2 in `backend/` (file-based API routes under `backend/src/api/app/...`).
- **Identity**: Supabase Auth (email OTP + TOTP). Hosting: Railway (services `eCommerce` = frontend, `Medusa` = backend).
- Scripts: `npm run dev` (Vite), `npm run build`, `npm test` (frontend `node --test` + backend), `npm run dev:backend`. Backend: `npm --prefix backend run build`, `... typecheck`, `... test`.
- **Demo mode**: run with `VITE_DEMO_MODE=true` to bypass login and render every panel with mock data (used for local UI verification).

## Two databases (don't confuse them)
1. **Medusa Postgres**, schema `medusa` — `purchase_orders`, `store_orders`, `product_promotions`, `bug_reports`, `platform_invoices`, `login_prefs`. Access with knex: `req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)`.
2. **Supabase `public`** — profiles, memberships, roles, capabilities, role_capabilities, tenants, sites, audit_events. Access with `getServiceClient()` (service-role PostgREST) in `backend/src/security/supabase-scope-resolver.ts`.

## Design system — use tokens & classes, never hardcode
- **Colours/spacing/radius come from CSS variables in `src/theme.css`** (`--primary`, `--bg`, `--surface`, `--text`, `--text-muted`, `--border`, `--success/-weak`, `--warning`, `--danger`, `--r-md`, `--shadow-md`, …). Never hardcode hex colours — the app is theme-aware (light/dark) and white-labels per tenant.
- **Structural classes** (all in theme.css): `card` / `card-hd` / `card-bd`; `btn` + `btn-primary|secondary|ghost|danger|sm|lg|block`; `icon-btn`; `badge` + `badge-primary|success|warning|danger|info|neutral`; `table` inside `table-wrap`; `page-head`; `kpi-label|value|sub`; `modal` + `modal-hd|bd|ft` + `modal-sm|lg`; `overlay`; `input` / `select` / `textarea` / `field` / `field-label`; `muted` / `eyebrow` / `tabular`. Match the surrounding component's density and inline-style patterns.

## Reusable building blocks (prefer these over re-rolling)
- **Long-row data tables → `src/components/TableToolbar.jsx`**: `<SearchExportBar value onChange placeholder onExport exportDisabled />` in the card head + `matchQuery(row, query, [fields])` to filter. Wire the CSV export over the **filtered** rows so export matches what's shown. Show an "N of M" count and a "no match" empty state.
- **CSV → `src/utils/exportCsv.js`**: `downloadCsv(filename, columns, rows)` where `columns = [{ key, label, map? }]`, plus `dateStamp()`.
- **Print / PDF → `src/utils/printDoc.js`**: `printDocument(title, bodyHtml)` (standalone branded doc, multi-page safe) or `triggerPrint(w)` (print a hand-built window when ready). **Do NOT call `window.print()` on in-app content** — the global `@media print` block in theme.css hides everything except `.invoice-print`, so bare `window.print()` prints blank. One-page receipts/invoices may instead be wrapped in `.invoice-print` with controls marked `.no-print`.
- Other shared UI: `SkeletonLoader` (`SkeletonPage` etc.), `InlineState` (`InlineError`/`InlineLoading`), `ConfirmDialog`, `ProductThumb`, `DateRangePicker`, `SignaturePad`.

## Access control & MFA
- **Nav is capability-gated**: `NAV_GROUPS` in `src/components/Sidebar.jsx`; each item has `cap` (or `capAny: [...]` for "any of"); `visibleNavGroups(tenantAccess)` filters by resolved capabilities. Grant a capability and the nav item appears automatically.
- **Backend gating**: `assertCapability(scope, cap[, requireMfa])` / `assertAnyCapability(scope, caps)` from `backend/src/security/tenant-scope`. Capabilities with `requires_mfa=true` (e.g. `commerce.manage`, `reports.run`, `audit.read`, `ppe.stock.issue`) need an **aal2 (authenticator)** session; cost/profit data is MFA-protected.
- **Contextual step-up**: the client fires `window.dispatchEvent(new CustomEvent('sightlive:mfa-required'))` on a 403 `mfa_required`; `MfaStepUp.jsx` challenges TOTP and dispatches `'sightlive:mfa-elevated'` on success — listen for that to refetch protected data.
- Public schema DDL can't be run as the Medusa DB role; apply capability/table changes via a node script run with `railway run --service Medusa -- node <script>` (service-role key from env), or add idempotent `alter table if exists … add column if not exists …` to the pre-deploy `bootstrap:store:direct`.

## Security (hard rules)
- **Never hardcode API keys / secrets / tokens** in code — the user sets env vars (`AGENTMAIL_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, hook secrets, etc.). Never print a secret's value.
- Never enter 2FA/TOTP codes, passwords, or the service-role key into any field. Never process a live payment.

## Deploying to Railway (only when the user asks)
- Both services deploy from GitHub `BurniMajozi/eCommerce` main, but **auto-deploy is unreliable** — deploy explicitly.
- **Run `railway up --service <eCommerce|Medusa> --detach` from the REPO ROOT** (not from `backend/` — the Medusa service builds `backend/Dockerfile` with root-dir `backend`; running from inside `backend/` fails the build).
- Medusa has a `preDeployCommand` (`bootstrap:store:direct`) that runs before boot. Deploys sometimes stall in `INITIALIZING` (Railway-side) with no error — the old container keeps serving; re-trigger a fresh `railway up` to clear it.
- Poll status reliably with `railway status --json` (parse each service's `latestDeployment.status`), not by log-grepping.
- **Verify before deploying**: `npm run build` (frontend) + `npm --prefix backend run typecheck` + `npm test` (64 tests). For UI changes, smoke-test in demo mode.

## Working style the user expects
- Verify before claiming done (build/tests/live check); don't assume a deploy succeeded — confirm the served bundle/endpoint actually changed.
- Commit/push only when asked; branch off main if needed. End commit messages with the Co-Authored-By line configured for this session.
