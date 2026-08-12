# Railway readiness (no deployment performed)

The repository is structured so the React frontend and `backend/` Medusa app
can be deployed as separate Railway services later. This document is a readiness
checklist only; it does not create Railway resources or secrets.

## Medusa service

Required server variables/connections:

- `DATABASE_URL`: TLS connection for a dedicated Supabase PostgreSQL login with
  access to the private `medusa` schema only;
- `DATABASE_SCHEMA=medusa`;
- `REDIS_URL`: Railway Redis private/TLS connection string;
- `REDIS_PREFIX=sightlive:`;
- `MEDUSA_WORKER_MODE=shared` initially;
- `JWT_SECRET` and `COOKIE_SECRET`: independent strong random values;
- `SUPABASE_URL`, `SUPABASE_JWT_ISSUER`, `SUPABASE_JWKS_URL` and
  `SUPABASE_JWT_AUDIENCE=authenticated`;
- `SUPABASE_SERVICE_ROLE_KEY`: server-only scope resolver credential;
- `STORE_CORS`, `ADMIN_CORS` and `AUTH_CORS`: final HTTPS origins;
- `PORT`: normally supplied by Railway.

Build/start commands are `npm install && npm run build` and `npm run start`
with the service root set to `backend`. Run reviewed Medusa migrations as an
explicit release step after the database role/schema exist; do not run them
against the Supabase `public` schema.

## Frontend service

Browser-safe build variables:

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_PUBLISHABLE_KEY`;
- `VITE_MEDUSA_BASE_URL` using the deployed HTTPS Medusa URL;
- `VITE_MEDUSA_CATALOGUE_ENABLED=true` only after tenant/site commerce links
  and catalogue data are ready;
- `VITE_DEMO_MODE=false` only for a live integration build.

Never expose the database password, Redis URL, Medusa secrets or Supabase
service-role key through a `VITE_*` variable.

## Remaining launch gates

1. Create the dedicated Supabase database role and private `medusa` schema.
2. Provision Railway Redis and bind its URL only to the Medusa service.
3. Create/review the Medusa sales channel, region, stock location and tenant/site
   links for CageLi.
4. Run the CSV validation flow on the approved source file; importing remains
   disabled until a transactional workflow is reviewed.
5. Configure MFA for privileged operators and test cost/import denials with an
   ordinary catalogue-reader account.
6. Run migrations, smoke tests and CORS checks before enabling live catalogue
   reads in the frontend.
