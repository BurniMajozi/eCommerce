import pg from 'pg'

const { Client } = pg
const schema = (process.env.DATABASE_SCHEMA || 'medusa').trim()

if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
  throw new Error('DATABASE_SCHEMA must be a simple PostgreSQL identifier.')
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required.')
}

const qualified = `"${schema}".store_orders`
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)
    ? undefined
    : { rejectUnauthorized: false },
})

try {
  await client.connect()
  const namespace = await client.query('select to_regnamespace($1) as name', [schema])
  if (!namespace.rows[0]?.name) {
    throw new Error(`Configured database schema "${schema}" does not exist.`)
  }

  await client.query(`
    create table if not exists ${qualified} (
      id text primary key,
      tenant_id text not null,
      reference text not null,
      buyer_name text,
      buyer_email text,
      buyer_phone text,
      company text,
      lines jsonb not null default '[]'::jsonb,
      currency text not null default 'ZAR',
      subtotal numeric not null default 0,
      discount numeric not null default 0,
      total numeric not null default 0,
      status text not null default 'pending',
      pickup_code text,
      paystack_ref text,
      created_by text,
      paid_at timestamptz,
      collected_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    alter table ${qualified} add column if not exists created_by text;
    create index if not exists store_orders_tenant_idx on ${qualified}(tenant_id);
    create unique index if not exists store_orders_reference_uq on ${qualified}(reference);
    create index if not exists store_orders_paystack_idx on ${qualified}(paystack_ref);
  `)

  const verification = await client.query(
    `select to_regclass($1) as table_name,
            exists (
              select 1 from information_schema.columns
              where table_schema = $2 and table_name = 'store_orders' and column_name = 'created_by'
            ) as has_created_by`,
    [`${schema}.store_orders`, schema],
  )

  if (!verification.rows[0]?.table_name || !verification.rows[0]?.has_created_by) {
    throw new Error('Store order schema verification failed.')
  }

  console.log(`[store] ${schema}.store_orders table ready and verified.`)
} finally {
  await client.end().catch(() => undefined)
}
