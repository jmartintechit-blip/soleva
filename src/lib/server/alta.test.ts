import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { createPgliteDb } from './db/pglite.ts';
import { openAccount } from './alta.ts';

let db: Db;
beforeEach(async () => {
  db = createPgliteDb();
  await migrate(db);
  await db.query(
    `insert into "user" (id, name, email, "emailVerified") values ('ana', '', 'ana@x.es', true)`,
  );
});
afterEach(() => db.close());

describe('alta inicial', () => {
  it('opens each account with its value today; a debt negative, a savings account with its rate', async () => {
    const bank = await openAccount(db, 'ana', '2026-10-30', {
      name: 'Bankinter',
      kind: 'remunerada',
      cents: 3_824_015,
      rateBp: 200,
    });
    const home = await openAccount(db, 'ana', '2026-10-30', {
      name: 'Hipoteca',
      kind: 'deuda_hipoteca',
      cents: 15_000_000,
    });
    const broker = await openAccount(db, 'ana', '2026-10-30', {
      name: 'Trade Republic',
      kind: 'broker',
      cents: 0,
    });
    expect(
      await db.query(
        `select account_id, kind, amount_cents::float8 as a, source from movement order by amount_cents`,
      ),
    ).toEqual([
      { account_id: home, kind: 'apertura', a: -15_000_000, source: 'manual' },
      { account_id: bank, kind: 'apertura', a: 3_824_015, source: 'manual' },
    ]);
    expect(
      await db.query(`select rate_bp from interest_tier where account_id = $1`, [bank]),
    ).toEqual([{ rate_bp: 200 }]);
    // Each is the user's own.
    expect(
      await db.query(
        `select count(*)::int as n from account_access where user_id = 'ana' and role = 'propietario'`,
      ),
    ).toEqual([{ n: 3 }]);
    expect(broker).toBeTruthy();
  });
});
