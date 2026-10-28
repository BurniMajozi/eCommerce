---
name: sightlive-design-system
description: >-
  Project-aware knowledge for building UI and backend code in the SightLive /
  CageLi PPE stock-management repo (React + Vite + Tailwind with a HAND-ROLLED
  design system — not shadcn). Use this whenever you create, edit, or review
  anything in this repo's front end — components, tables, forms, modals,
  portals, KPI cards, search/export, print/PDF — or its backend — Medusa API
  routes, capability/MFA gating, the Medusa + Supabase two-database model — so
  new code matches the project's tokens, classes, reusable helpers and
  conventions instead of generic or shadcn markup. Trigger it even when the user
  doesn't name the design system: any "add a table / card / modal / view / page
  / report / export / print button" or "add an API route / capability" task in
  this project should consult it first. NOT for unrelated repos or generic
  React scaffolding outside SightLive.
---

# SightLive / CageLi design system & conventions

SightLive is a PPE B2B stock-management platform for South African mining:
React + Vite + Tailwind front end with a **bespoke design system** (no shadcn,
no component library), a Medusa v2 backend in `backend/`, Supabase for identity,
deployed on Railway. Match what's already in the repo — read a nearby component
before writing a new one and mirror its structure and density.

## Golden rules (the ones that bite if ignored)
1. **Never hardcode colours, radii, or shadows.** Everything comes from CSS
   variables in `src/theme.css` (`var(--primary)`, `var(--surface)`,
   `var(--text-muted)`, `var(--danger)`, `var(--shadow-md)`, …). The app is
   theme-aware (light/dark) and white-labels per tenant — a hardcoded `#fff` or
   `#333` breaks both. Use the semantic classes below; reach for `var(--token)`
   only for one-off inline styles.
2. **Use the shared building blocks, don't re-roll them:**
   - Long-row/data tables → `SearchExportBar` + `matchQuery` from
     `src/components/TableToolbar.jsx` (in-place search + filtered CSV export).
   - CSV → `downloadCsv(filename, columns, rows)` from `src/utils/exportCsv.js`.
   - Print / PDF → `printDocument()` / `triggerPrint()` from
     `src/utils/printDoc.js`. **Never call `window.print()` on in-app content** —
     the global `@media print` in theme.css hides everything except
     `.invoice-print`, so a bare `window.print()` prints a blank page.
   - Icons → **lucide-react** only.
3. **Nav and backend reads/writes are capability-gated.** Adding a screen means
   adding a nav item with a `cap` in `Sidebar.jsx` and gating its API route with
   `assertCapability` / `assertAnyCapability`. MFA-flagged capabilities need an
   aal2 session — see the step-up pattern.
4. **Two separate databases.** Medusa's `medusa` Postgres schema (knex) vs
   Supabase `public` (service-role PostgREST). Don't reach for the wrong one.
5. **Security:** never hardcode secrets/API keys (the user sets env vars); never
   enter credentials, OTP, or the service-role key anywhere; never print a
   secret's value.

## Reference files — read the one that matches the task
- **`references/design-system.md`** — tokens, every structural class
  (`card`, `btn*`, `badge*`, `table`, `modal*`, `page-head`, `kpi-*`, form
  controls), the `Head`/`Wrap` view layout, and copy-paste component patterns
  (a view, a data table, a modal, a KPI row, an empty/loading state). **Read
  this for any front-end work.**
- **`references/helpers.md`** — exact signatures and usage for `SearchExportBar`
  / `matchQuery`, `downloadCsv`, and `printDocument` / `triggerPrint`, with a
  full worked "searchable + exportable table" example. Read this whenever a
  table, search, CSV, or print/PDF is involved.
- **`references/architecture.md`** — the Medusa + Supabase two-database model
  and how to query each, capability model + MFA step-up events, how nav gating
  resolves, where API routes live, demo mode, and the Railway deploy flow. Read
  this for backend routes, capabilities, data access, or deploys.

## Fast orientation
- Frontend source: `src/` (components in `src/components/`, utils in
  `src/utils/`, catalogue client in `src/catalogue/catalogueClient.js`,
  app/tenant context in `src/context/` and `src/tenant/`).
- Backend routes: `backend/src/api/app/...` (Medusa file-based routing —
  a `route.ts` exporting `GET`/`POST`/`PATCH` is auto-registered).
- Run/verify: `npm run dev` (Vite); `VITE_DEMO_MODE=true npm run dev` bypasses
  login for UI work; `npm run build`; `npm test`; backend
  `npm --prefix backend run typecheck` / `... test`.
