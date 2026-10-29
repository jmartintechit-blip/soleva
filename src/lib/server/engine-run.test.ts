import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { createPgliteDb } from './db/pglite.ts';
import { runUser } from './engine-run.ts';

let db: Db;
let acc: Record<string, string>;
let world: string;
beforeEach(async () => {
  db = createPgliteDb();
  await migrate(db);
  for (const id of ['ana', 'eva'])
    await db.query(
      `insert into "user" (id, name, email, "emailVerified") values ($1, '', $2, true)`,
      [id, `${id}@x.es`],
    );
  acc = {};
  for (const [k, kind] of [
    ['rem', 'remunerada'],
    ['brk', 'broker'],
  ] as const) {
    const [{ id }] = await db.query<{ id: string }>(
      `insert into money_account (user_id, name, kind, balance_cents) values ('ana', $1, $2, 0) returning id`,
      [k, kind],
    );
    acc[k] = id;
  }
  [{ id: world }] = await db.query<{ id: string }>(
    `insert into instrument (kind, name, currency, price_source, source_id) values ('etf', 'World', 'USD', 'yahoo', 'IWDA.AS') returning id`,
  );
  await db.query(
    `insert into movement (account_id, day, kind, amount_cents, source, occurrence_key)
     values ($1, '2026-10-31', 'apertura', 1000000, 'migracion', 'migracion:rem'),
            ($2, '2026-10-31', 'apertura', 10000, 'migracion', 'migracion:brk')`,
    [acc.rem, acc.brk],
  );
  await db.query(`insert into engine_state values ('ana', '2026-10-31')`);
  await db.query(
    `insert into auto_rule (id, user_id, name, kind, frequency, day, start_on, from_account_id, to_account_id, amount_cents)
     values ('t', 'ana', 'Al bróker', 'transferencia', 'mensual', 1, '2026-01-01', $1, $2, 100000)`,
    [acc.rem, acc.brk],
  );
  await db.query(
    `insert into auto_rule (id, user_id, name, kind, frequency, day, start_on, from_account_id)
     values ('p', 'ana', 'Plan', 'plan', 'semanal', 1, '2026-11-01', $1)`,
    [acc.brk],
  );
  await db.query(`insert into auto_rule_leg values ('p', 0, $1, 25000)`, [world]);
  await db.query(`insert into interest_config (account_id) values ($1)`, [acc.rem]);
  await db.query(`insert into interest_tier values ($1, null, 200)`, [acc.rem]);
  await db.query(`insert into fx_rate values ('USD', '2026-10-30', 108500000)`);
  await db.query(`insert into price values ($1, '2026-10-30', 10850000000, 'yahoo')`, [world]);
});
afterEach(() => db.close());

const count = async (sql: string, params: unknown[] = []) =>
  Number((await db.query<{ n: number }>(`select count(*)::int as n ${sql}`, params))[0]!.n);

describe('runUser', () => {
  it('stores what the engine owes, once, with holdings, history and alerts', async () => {
    // Monday 2 November: only Friday's close is known, so the plan's buy is provisional.
    expect(await runUser(db, 'ana', '2026-11-02')).toEqual({
      generated: 3,
      repriced: 0,
      alerts: 2,
    });
    expect(
      await db.query(
        `select kind, amount_cents::float8 as a, provisional from movement where source = 'regla' order by day, seq`,
      ),
    ).toEqual([
      { kind: 'transferencia', a: -100000, provisional: false },
      { kind: 'transferencia', a: 100000, provisional: false },
      { kind: 'compra', a: -25000, provisional: true },
    ]);
    expect(await db.query(`select qty_e8::text as q from position`)).toEqual([{ q: '250000000' }]);
    // 250 € a week is more than the 1.000 € a month that come in, and the broker's 1.100 € are
    // −150 € after the Monday of 30 November, the day before the next transfer.
    expect(await db.query(`select kind, day::text as day, state from alert order by kind`)).toEqual(
      [
        { kind: 'plan_supera', day: '2026-11-02', state: 'abierta' },
        { kind: 'sin_saldo', day: '2026-11-30', state: 'abierta' },
      ],
    );
    expect(await count(`from user_day where user_id = 'ana'`)).toBe(2);

    // Again the same day: nothing new. Monday's close arrives: the buy is repriced, same money.
    expect(await runUser(db, 'ana', '2026-11-02')).toMatchObject({ generated: 0 });
    await db.query(`insert into price values ($1, '2026-11-02', 11000000000, 'yahoo')`, [world]);
    expect(await runUser(db, 'ana', '2026-11-03')).toMatchObject({ generated: 0, repriced: 1 });
    expect(
      await db.query(`select qty_e8::text as q, provisional from movement where kind = 'compra'`),
    ).toEqual([{ q: '246590909', provisional: false }]);
    expect(await db.query(`select processed_through::text as d from engine_state`)).toEqual([
      { d: '2026-11-03' },
    ]);

    // The rule stops: the alert is resolved on the next run.
    await db.query(`update auto_rule set active = false where id = 'p'`);
    await runUser(db, 'ana', '2026-11-04');
    expect(await db.query(`select state from alert`)).toEqual([
      { state: 'resuelta' },
      { state: 'resuelta' },
    ]);
  });

  it('catches up missed days in one run and skips users not on the ledger', async () => {
    expect(await runUser(db, 'eva', '2026-11-30')).toBeNull();
    await runUser(db, 'ana', '2026-11-30');
    // 1 transfer (2 legs), 5 Mondays and November's interest on the savings account.
    expect(await count(`from movement where source in ('regla', 'motor')`)).toBe(2 + 5 + 1);
    expect(await count(`from user_day where user_id = 'ana'`)).toBe(30);
    expect(await count(`from account_month where month = '2026-11-01'`)).toBe(2);
    // The cash forecast is kept for the next run, 60 days ahead.
    expect(
      await db.query(
        `select forecast->>'through' as through from engine_state where user_id = 'ana'`,
      ),
    ).toEqual([{ through: '2027-01-29' }]);
  });
});
