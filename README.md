# SightLive PPE Stock Platform

This repository contains the React/Vite PPE operations frontend and the Phase 1
foundation for a Medusa commerce backend plus Supabase identity and tenancy.
The current UI still uses its original mock data and React Context actions by
design; configuring Supabase activates session and tenant discovery only.

## Repository layout

```text
./                    React 19 + Vite frontend (existing application)
backend/              Medusa v2 application and tenant-scope middleware
supabase/migrations/  Auth-linked tenancy, RBAC, RLS and projection schema
docs/                 Architecture, security boundaries and local setup
```

## Quick start

```bash
npm install
npm run dev
```

With no frontend environment file, the app remains in safe demo mode and all
existing mock workflows behave as before. See [docs/phase-1-foundation.md](docs/phase-1-foundation.md)
for Supabase and Medusa setup, migrations, environment variables and validation.

## Architecture rule

Medusa owns commerce and stock transactions. Supabase owns authentication,
tenant membership/RBAC/RLS, private files and read-only Realtime projections.
Tenant authorization is enforced again on the Medusa server; browser-selected
tenant or role values are never trusted.

---

## Original Vite template notes

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
