# Medusa database and Redis requirements

Medusa can share the existing Supabase PostgreSQL instance only with isolation:

- a dedicated database login role such as `medusa_app`;
- `DATABASE_SCHEMA=medusa`; and
- a TLS session-pooler/direct connection suitable for a persistent server.

The `medusa` schema must not be included in Supabase Data API exposed schemas.
The database role needs create/read/write rights in `medusa` and only narrowly
reviewed access to public tenant-scope functions. Creating it requires a newly
generated database password and an authorized SQL session. Neither exists in
local credentials, so no database role, schema, or Medusa migration was created.

Redis choices:

- Local: `redis://localhost:6379`. Redis is not installed locally and Docker
  Desktop is stopped, so this is not currently runnable.
- Managed: `rediss://USERNAME:PASSWORD@HOST:PORT/0`. The user must select a
  provider and supply its server-side TLS URL through ignored `backend/.env` or
  a deployment secret store.

When `REDIS_URL` is configured, Medusa now uses it for sessions, the event bus,
durable workflow execution, and distributed locking, with the `sightlive:` key
prefix. Current frontend mock behavior remains unchanged.

Other required server-only values are strong independent `JWT_SECRET` and
`COOKIE_SECRET` values and, for the current scope resolver implementation, the
Supabase secret/service-role key. None belongs in the browser. Run
`npm --prefix backend run config:check` to validate shape without connecting.
