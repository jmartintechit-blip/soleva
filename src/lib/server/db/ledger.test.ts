// The ledger schema (B8): what the database itself refuses, whatever the code above it does.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './index.ts';
import { migrate } from './migrate.ts';
import { createPgliteDb } from './pglite.ts';

let db: Db;
beforeEach(async () => {
  db = createPgliteDb();
  await migrate(db);
  for (const id of ['ana', 'eva'])
    await db.query(
      `insert into "user" (id, name, email, "emailVerified") values ($1, '', $2, true)`,
      [id, `${id}@example.com`],
    );
});
afterEach(() => db.close());

const instrument = async (values: string) =>
  (
    await db.query<{ id: string }>(
      `insert into instrument (kind, name, isin, currency, price_source, source_id, owner_user_id)
       values ${values} returning id`,
    )
  )[0]!.id;

describe('instruments and prices', () => {
  it('keeps one shared row per listing, and estimates are always somebody’s', async () => {
    const world = await instrument(
      `('etf', 'World ETF', 'IE00B4L5Y983', 'USD', 'yahoo', 'IWDA.AS', null)`,
    );
    await expect(
      instrument(`('etf', 'World ETF', 'IE00B4L5Y983', 'USD', 'yahoo', 'IWDA.AS', null)`),
    ).rejects.toThrow();
    await expect(
      instrument(`('etf', 'Bad', 'IE00B4L5Y98', 'EUR', 'manual', null, 'ana')`),
    ).rejects.toThrow();
    // No public price for an estimate, and no estimate without an owner.
    await expect(
      instrument(`('estimado', 'PM', null, 'EUR', 'manual', null, 'ana')`),
    ).rejects.toThrow();
    await expect(instrument(`('estimado', 'PM', null, 'EUR', null, null, null)`)).rejects.toThrow();
    const pm = await instrument(`('estimado', 'Private markets', null, 'EUR', null, null, 'ana')`);

    await db.query(`insert into price values ($1, '2026-10-29', 9_812_000_000, 'yahoo')`, [world]);
    await expect(
      db.query(`insert into price values ($1, '2026-10-29', 0, 'yahoo')`, [world]),
    ).rejects.toThrow();
    await db.query(
      `insert into price_override (user_id, instrument_id, day, close_e8)
      values ('ana', $1, '2026-10-30', 9_900_000_000)`,
      [world],
    );

    // Ana leaving takes her estimate and her own prices, never the shared listing or its price.
    await db.query(`delete from "user" where id = 'ana'`);
    expect(await db.query(`select id from instrument`)).toEqual([{ id: world }]);
    expect(await db.query(`select 1 from price_override`)).toEqual([]);
    expect(await db.query(`select 1 from price`)).toHaveLength(1);
    expect(pm).toBeTruthy();
  });

  it('takes ECB rates and splits only in their valid shape', async () => {
    await db.query(`insert into fx_rate values ('USD', '2026-10-29', 108_500_000)`);
    await expect(db.query(`insert into fx_rate values ('EUR', '2026-10-29', 1)`)).rejects.toThrow();
    const id = await instrument(`('accion', 'Acme', null, 'USD', 'yahoo', 'ACME', null)`);
    await db.query(
      `insert into corporate_action (instrument_id, day, kind, ratio_num, ratio_den)
      values ($1, '2026-06-01', 'split', 4, 1)`,
      [id],
    );
    await expect(
      db.query(
        `insert into corporate_action (instrument_id, day, kind, ratio_num, ratio_den)
        values ($1, '2026-06-02', 'split', 0, 1)`,
        [id],
      ),
    ).rejects.toThrow();
  });
});
