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

  // Replenishment: mark POs raised by the auto-replenishment engine so the
  // merchant approval queue can surface them and the approve gate can allow it.
  await client.query(`alter table if exists "${schema}".purchase_orders add column if not exists origin text;`).catch(() => {})

  // Safety App ticket layer. Every event (request, PO, store sale, invoice,
  // escalation, safety incident) becomes a ticket with a human common key
  // (SL-PO-00042…), a category + trigger, a flow status, an escalation line and
  // a notes thread. Tickets wrap the source record via a unique (tenant, source)
  // key so materialisation is idempotent.
  const tickets = `"${schema}".tickets`
  const ticketNotes = `"${schema}".ticket_notes`
  await client.query(`
    create table if not exists ${tickets} (
      id text primary key,
      tenant_id text not null,
      site_id text,
      seq bigint not null,
      common_key text not null,
      category text not null,
      trigger text,
      source_type text,
      source_id text,
      reference text,
      subject text,
      status text not null default 'open',
      priority text not null default 'normal',
      value numeric,
      currency text default 'ZAR',
      escalated boolean not null default false,
      escalated_at timestamptz,
      escalated_by text,
      resolved_at timestamptz,
      resolved_by text,
      created_by text,
      assigned_to text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create unique index if not exists tickets_tenant_key_uq on ${tickets}(tenant_id, common_key);
    create unique index if not exists tickets_tenant_source_uq on ${tickets}(tenant_id, source_type, source_id) where source_id is not null;
    create index if not exists tickets_tenant_cat_idx on ${tickets}(tenant_id, category);
    create index if not exists tickets_tenant_status_idx on ${tickets}(tenant_id, status);
    create index if not exists tickets_tenant_esc_idx on ${tickets}(tenant_id, escalated);
    create index if not exists tickets_tenant_ref_idx on ${tickets}(tenant_id, reference);
    create table if not exists ${ticketNotes} (
      id text primary key,
      ticket_id text not null,
      tenant_id text not null,
      body text not null,
      author_user_id text,
      author_name text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists ticket_notes_ticket_idx on ${ticketNotes}(ticket_id);
  `)

  const ticketsReady = await client.query(`select to_regclass($1) as t`, [`${schema}.tickets`])
  if (!ticketsReady.rows[0]?.t) throw new Error('Ticket table verification failed.')
  console.log(`[tickets] ${schema}.tickets + ticket_notes ready and verified.`)

  // Notifications: fan-out — ONE row per recipient user, so read/unread state is
  // per person. Emitted server-side by events (escalation, safety report/alert,
  // PO decision, acknowledgment) and resolved to recipients by role + site.
  const notifications = `"${schema}".notifications`
  await client.query(`
    create table if not exists ${notifications} (
      id text primary key,
      tenant_id text not null,
      site_id text,
      recipient_user_id text not null,
      type text not null,
      title text not null,
      body text,
      severity text not null default 'info',
      link_role text,
      link_id text,
      read_at timestamptz,
      created_by text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    create index if not exists notifications_recipient_idx on ${notifications}(tenant_id, recipient_user_id, created_at desc);
    create index if not exists notifications_unread_idx on ${notifications}(tenant_id, recipient_user_id, read_at);
  `)
  const notifReady = await client.query(`select to_regclass($1) as t`, [`${schema}.notifications`])
  if (!notifReady.rows[0]?.t) throw new Error('Notifications table verification failed.')
  console.log(`[notifications] ${schema}.notifications ready and verified.`)

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
