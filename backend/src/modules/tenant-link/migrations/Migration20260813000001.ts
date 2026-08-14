import { Migration } from '@mikro-orm/migrations';

// Creates the tenant-link module tables (tenant_link, site_link). Written by
// hand because `medusa db:generate` produced no migration in this scaffold.
// Idempotent (IF NOT EXISTS) so it is safe even if the tables were already
// created by an earlier generate+migrate run.
export class Migration20260813000001 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table if not exists "tenant_link" (
      "id" text not null,
      "supabase_tenant_id" text not null,
      "sales_channel_id" text null,
      "default_region_id" text null,
      "status" text check ("status" in ('setup', 'active', 'suspended', 'closed')) not null default 'setup',
      "metadata" jsonb null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "tenant_link_pkey" primary key ("id")
    );`);
    this.addSql(`create unique index if not exists "IDX_tenant_link_supabase_tenant_id_unique" on "tenant_link" ("supabase_tenant_id") where "deleted_at" is null;`);
    this.addSql(`create index if not exists "IDX_tenant_link_deleted_at" on "tenant_link" ("deleted_at") where "deleted_at" is null;`);

    this.addSql(`create table if not exists "site_link" (
      "id" text not null,
      "supabase_site_id" text not null,
      "supabase_tenant_id" text not null,
      "stock_location_id" text null,
      "sales_channel_id" text null,
      "status" text check ("status" in ('active', 'suspended', 'closed')) not null default 'active',
      "metadata" jsonb null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "site_link_pkey" primary key ("id")
    );`);
    this.addSql(`create unique index if not exists "IDX_site_link_supabase_site_id_unique" on "site_link" ("supabase_site_id") where "deleted_at" is null;`);
    this.addSql(`create index if not exists "IDX_site_link_deleted_at" on "site_link" ("deleted_at") where "deleted_at" is null;`);
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "site_link" cascade;`);
    this.addSql(`drop table if exists "tenant_link" cascade;`);
  }
}
