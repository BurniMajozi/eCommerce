import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { newDb } from 'pg-mem';
import { STORE_DDL } from '../src/db/store-schema';

test('store bootstrap upgrades an existing pre-created table with created_by', async () => {
  const memory = newDb();
  const knex = memory.adapters.createKnex();
  try {
    await knex.raw('create table store_orders (id text primary key, tenant_id text not null, reference text not null)');
    const upgrade = STORE_DDL.match(/alter table store_orders add column if not exists created_by text;/i)?.[0];
    assert.ok(upgrade, 'the release schema must contain the idempotent created_by upgrade');
    await knex.raw(upgrade);
    const columns = await knex('information_schema.columns')
      .where({ table_name: 'store_orders' })
      .pluck('column_name');
    assert.ok(columns.includes('created_by'));
  } finally {
    await knex.destroy();
  }
});

test('Railway pre-deploy invokes the idempotent direct store bootstrap', async () => {
  const railway = JSON.parse(await readFile(resolve(process.cwd(), 'railway.json'), 'utf8'));
  const direct = await readFile(resolve(process.cwd(), 'scripts/bootstrap-store-db.mjs'), 'utf8');
  assert.equal(railway.deploy.preDeployCommand, 'npm run bootstrap:store:direct');
  assert.match(direct, /alter table \$\{qualified\} add column if not exists created_by text/i);
});
