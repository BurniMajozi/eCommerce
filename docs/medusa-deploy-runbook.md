# Medusa deployment + first-tenant link runbook

Concrete steps to stand up the Medusa backend against the shared Supabase
Postgres and wire the first tenant/site to commerce. Turns
`railway-readiness.md` (a checklist) into runnable commands. Nothing here runs
migrations against the `public` schema.

**Prerequisites**
- Supabase project live with migrations `…0001`–`…0006` applied and the
  first-tenant seed run (`supabase/apply-latest.sql` / `001_first_tenant.sql`).
- Asymmetric JWT signing enabled (Dashboard → Authentication → JWT Keys). The
  project's JWKS already serves ES256 keys, so `/app/*` token verification works.
- Node 20–24 locally if you run migrations from your machine.

---

## 1 · Create the Medusa DB schema + role
Run `supabase/bootstrap/002_medusa_schema.sql` in the Supabase SQL Editor (edit
the password first). It creates the isolated `medusa` schema and the
`medusa_app` login role.

Build `DATABASE_URL` from **Project Settings → Database → Connection string →
Session pooler**, swapping in the Medusa role/password:

```
postgresql://medusa_app.ppkvrqdatjzriatudblw:<PASSWORD>@<POOLER_HOST>:5432/postgres?sslmode=require
```

Use the **Session** pooler (persistent server), not Transaction.

## 2 · Provision Redis
Create a Redis instance (Upstash free tier, or Railway Redis) and copy its
`rediss://…` URL. Bind it only to the Medusa service.

## 3 · Generate secrets
Two independent values:
```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 48   # COOKIE_SECRET
```

## 4 · Deploy the Medusa service
**Railway (Nixpacks):** new service from the GitHub repo →
- **Root Directory:** `backend`
- **Build:** `npm install && npm run build`
- **Start:** `npm run start`

**Any container host:** build `backend/Dockerfile` instead.

Set these **server-only** env vars (never `VITE_*`):

| Var | Value |
|---|---|
| `DATABASE_URL` | from step 1 |
| `DATABASE_SCHEMA` | `medusa` |
| `REDIS_URL` | from step 2 |
| `REDIS_PREFIX` | `sightlive:` |
| `MEDUSA_WORKER_MODE` | `shared` |
| `JWT_SECRET`, `COOKIE_SECRET` | from step 3 |
| `SUPABASE_URL` | `https://ppkvrqdatjzriatudblw.supabase.co` |
| `SUPABASE_JWKS_URL` | `https://ppkvrqdatjzriatudblw.supabase.co/auth/v1/.well-known/jwks.json` |
| `SUPABASE_JWT_ISSUER` | `https://ppkvrqdatjzriatudblw.supabase.co/auth/v1` |
| `SUPABASE_JWT_AUDIENCE` | `authenticated` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role (secret) |
| `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS` | your frontend HTTPS origin(s) |
| `PORT` | injected by the platform |

Validate the env shape before deploying (no network calls):
```bash
npm --prefix backend run config:check
```

## 5 · Run module migrations (release step)
After the role/schema exist and env is set:
```bash
npm --prefix backend run db:generate   # review the generated tenantLink migration
npm --prefix backend run db:migrate
```
On Railway, run these as a one-off/release command against the deployed env.

## 6 · Create commerce resources
Create the first Medusa admin user (one-off):
```bash
npm --prefix backend exec -- medusa user -e admin@sightlive -p <password>
```
Open the Medusa Admin (`<medusa-url>/app`) and create:
- a **Region** (currency ZAR, your countries),
- a **Sales Channel** (e.g. "Kumba — Plant Alpha"),
- a **Stock Location** (e.g. "Store 2").

Copy each ID (`reg_…`, `sc_…`, `sloc_…`).

## 7 · Link tenant/site → commerce
Use the `SUPA_TENANT_ID` / `SUPA_SITE_ID` printed by the Supabase seed and the
IDs from step 6:
```bash
SUPA_TENANT_ID=<uuid> SALES_CHANNEL_ID=<sc_…> DEFAULT_REGION_ID=<reg_…> \
SUPA_SITE_ID=<uuid>   STOCK_LOCATION_ID=<sloc_…> \
npm --prefix backend run bootstrap:links
```

## 8 · Verify the protected API
Get a Supabase access token (sign into the frontend and copy
`session.access_token`, or via the Auth API), then:
```bash
curl -s <medusa-url>/app/context \
  -H "Authorization: Bearer <access-token>" \
  -H "X-Tenant-ID: <SUPA_TENANT_ID>" \
  -H "X-Site-ID: <SUPA_SITE_ID>"
```
Expect `roles`, `capabilities`, `mfa_capabilities`, `assurance_level`.
`GET /app/catalogue` → `200` with empty `items` until products are published on
the linked sales channel, or `409 tenant_commerce_link_required` if step 7 was
skipped.

## 9 · Flip the frontend to live catalogue
In the frontend deploy env (or `.env.local`):
```
VITE_MEDUSA_BASE_URL=<medusa https url>
VITE_MEDUSA_CATALOGUE_ENABLED=true
```
Products & Pricing then reads live. **Profitability** (`/app/catalogue/profit`)
additionally requires `commerce.manage` **and an MFA (aal2) session** — enrol the
operator in TOTP.

---

### Guardrails
- Keep the `medusa_app` password and the Supabase **service-role key** in the
  host's secret store only — never in `VITE_*` or git.
- `ADMIN_CORS`/`STORE_CORS`/`AUTH_CORS` must list the exact frontend origin(s).
- CSV import stays validation-only until a reviewed transactional workflow lands.
