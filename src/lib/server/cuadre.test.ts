import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { createPgliteDb } from './db/pglite.ts';
import { loadCuadre, saveCuadre } from './cuadre.ts';

let db: Db;
let brk: string;
let world: string;
beforeEach(async () => {
  db = createPgliteDb();
  await migrate(db);
  for (const id of ['ana', 'eva'])
    await db.query(
      `insert into "user" (id, name, email, "emailVerified") values ($1, '', $2, true)`,
      [id, `${id}@x.es`],
    );
  [{ id: brk }] = await db.query<{ id: string }>(
    `insert into money_account (user_id, name, kind, balance_cents) values ('ana', 'Bróker', 'broker', 0) returning id`,
  );
  [{ id: world }] = await db.query<{ id: string }>(
    `insert into instrument (kind, name, currency, price_source, source_id) values ('etf', 'World', 'EUR', 'yahoo', 'W') returning id`,
  );
  await db.query(
    `insert into movement (account_id, day, kind, amount_cents, instrument_id, qty_e8, price_e8, source)
     values ($1, '2026-10-01', 'apertura', 50000, null, null, null, 'migracion'),
            ($1, '2026-10-05', 'compra', -30000, $2, 300000000, 10000000000, 'regla')`,
    [brk, world],
  );
});
afterEach(() => db.close());

describe('cuadre', () => {
  it('shows what the ledger holds and saves only the differences, as ajustes of today', async () => {
    expect(await loadCuadre(db, 'ana', brk)).toEqual({
      account: { id: brk, name: 'Bróker', kind: 'broker' },
      rows: [
        { instrumentId: null, name: 'Efectivo', kind: 'efectivo', expected: '20000' },
        { instrumentId: world, name: 'World', kind: 'etf', expected: '300000000' },
      ],
    });
    // Cash 198,47 € instead of 200 €; the units already match: one ajuste.
    expect(
      await saveCuadre(db, 'ana', brk, '2026-10-30', {
        cashCents: 19_847,
        units: { [world]: 300_000_000n },
      }),
    ).toBe(1);
    expect(
      await db.query(
        `select day::text as d, kind, amount_cents::float8 as a, source from movement where kind = 'ajuste'`,
      ),
    ).toEqual([{ d: '2026-10-30', kind: 'ajuste', a: -153, source: 'cuadre' }]);
    expect(
      await saveCuadre(db, 'ana', brk, '2026-10-30', { units: { [world]: 299_870_000n } }),
    ).toBe(1);
    expect((await loadCuadre(db, 'ana', brk))!.rows.map((r) => r.expected)).toEqual([
      '19847',
      '299870000',
    ]);
  });

  it('is not for someone without the right to change the account, nor for products it never held', async () => {
    expect(await loadCuadre(db, 'eva', brk)).toBeNull();
    expect(await saveCuadre(db, 'eva', brk, '2026-10-30', { cashCents: 0, units: {} })).toBeNull();
    await db.query(`insert into account_access values ($1, 'eva', 'lector')`, [brk]);
    expect(await loadCuadre(db, 'eva', brk)).toBeNull();
    const [{ id: other }] = await db.query<{ id: string }>(
      `insert into instrument (kind, name, currency, price_source, source_id) values ('etf', 'X', 'EUR', 'yahoo', 'X') returning id`,
    );
    expect(await saveCuadre(db, 'ana', brk, '2026-10-30', { units: { [other!]: 1n } })).toBe(0);
  });

});
