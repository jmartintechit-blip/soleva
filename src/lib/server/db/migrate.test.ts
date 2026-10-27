import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './index.ts';
import { MIGRATIONS_DIR, migrate } from './migrate.ts';
import { createPgliteDb } from './pglite.ts';

let db: Db;
let dir: string;
beforeEach(async () => {
  db = createPgliteDb();
  dir = await mkdtemp(path.join(tmpdir(), 'soleva-migrations-'));
});
afterEach(async () => {
  await db.close();
  await rm(dir, { recursive: true });
});

const tables = async () =>
  (
    await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1",
    )
  ).map((r) => r.table_name);

describe('migrate', () => {
  it('applies the project migrations once', async () => {
    await migrate(db, MIGRATIONS_DIR);
    expect(await migrate(db, MIGRATIONS_DIR)).toEqual([]);
  });

  it('applies files in name order and skips the ones already applied', async () => {
    await writeFile(path.join(dir, '0002_b.sql'), 'create table b (a_id int references a);');
    await writeFile(path.join(dir, '0001_a.sql'), 'create table a (id int primary key);');
    await writeFile(path.join(dir, 'notes.txt'), 'not a migration');
    expect(await migrate(db, dir)).toEqual(['0001_a.sql', '0002_b.sql']);
    expect(await migrate(db, dir)).toEqual([]);
    expect(await tables()).toEqual(['a', 'b', 'schema_migrations']);
  });

  it('rolls back a failing migration entirely and stops there', async () => {
    await writeFile(path.join(dir, '0001_bad.sql'), 'create table x (id int); select 1/0;');
    await writeFile(path.join(dir, '0002_next.sql'), 'create table y (id int);');
    await expect(migrate(db, dir)).rejects.toThrow();
    expect(await tables()).toEqual(['schema_migrations']);
  });
});
