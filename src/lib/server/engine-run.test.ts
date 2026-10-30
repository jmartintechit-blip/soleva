import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { createPgliteDb } from './db/pglite.ts';
import { addDays } from '#lib/engine/day.ts';
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
      alerts: 1,
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
    // 250 € a week is more than the 1.000 € a month that come in. The broker itself never goes
    // below zero: the buy that does not fit is left undone (see below), not paid on credit.
    expect(await db.query(`select kind, day::text as day, state from alert order by kind`)).toEqual(
      [{ kind: 'plan_supera', day: '2026-11-02', state: 'abierta' }],
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
    expect(await db.query(`select state from alert`)).toEqual([{ state: 'resuelta' }]);
  });

  it('leaves undone the buy the broker cannot pay, or brings the money from the account chosen', async () => {
    // The broker's 1.100 € pay four Mondays; on 30 November 100 € are left for a 250 € buy.
    await runUser(db, 'ana', '2026-11-30');
    expect(
      await db.query(
        `select day::text as d, amount_cents::float8 as a, qty_e8 from movement where kind = 'no_ejecutada'`,
      ),
    ).toEqual([{ d: '2026-11-30', a: 0, qty_e8: null }]);
    expect(
      await db.query(`select kind, detail from alert where kind = 'compra_no_ejecutada'`),
    ).toEqual([{ kind: 'compra_no_ejecutada', detail: { ruleId: 'p', count: 1, cents: 25000 } }]);

    // Another user's account cannot pay for the plan; an own one can, from then on. Without
    // December's transfer the broker is short again on 7 December.
    const [{ id: eva }] = await db.query<{ id: string }>(
      `insert into money_account (user_id, name, kind, balance_cents) values ('eva', 'e', 'efectivo', 0) returning id`,
    );
    const choose = (account: string) =>
      db.query(
        `update auto_rule set shortfall = 'otra_cuenta', shortfall_account_id = $1 where id = 'p'`,
        [account],
      );
    await expect(choose(eva!)).rejects.toThrow(/cannot change/);
    await choose(acc.rem!);
    await db.query(`update auto_rule set active = false where id = 't'`);
    await runUser(db, 'ana', '2026-12-07');
    expect(
      await db.query(
        `select account_id = $1 as rem, kind, amount_cents::float8 as a from movement
          where day = '2026-12-07' order by seq`,
        [acc.rem],
      ),
    ).toEqual([
      { rem: true, kind: 'transferencia', a: -25000 },
      { rem: false, kind: 'transferencia', a: 25000 },
      { rem: false, kind: 'compra', a: -25000 },
    ]);
  });

  it('catches up missed days in one run and skips users not on the ledger', async () => {
    expect(await runUser(db, 'eva', '2026-11-30')).toBeNull();
    await runUser(db, 'ana', '2026-11-30');
    // 1 transfer (2 legs), 5 Mondays and November's interest on the savings account.
    expect(await count(`from movement where source in ('regla', 'motor')`)).toBe(2 + 5 + 1);
    expect(await count(`from user_day where user_id = 'ana'`)).toBe(30);
    // v0 pages still read balance_cents: it follows the ledger.
    expect(
      await db.query(`select balance_cents::float8 as b from money_account where id = $1`, [
        acc.brk,
      ]),
    ).toEqual([{ b: expect.any(Number) }]);
    expect(
      Number(
        (
          await db.query<{ b: number }>(
            `select balance_cents::float8 as b from money_account where id = $1`,
            [acc.rem],
          )
        )[0]!.b,
      ),
    ).toBeGreaterThan(800_000);
    // Each account's value and own flows per day: the transfer of 1 November is a flow of both.
    expect(
      await db.query(
        `select accounts->$1->>1 as rem, accounts->$2->>1 as brk from user_day where day = '2026-11-01'`,
        [acc.rem, acc.brk],
      ),
    ).toEqual([{ rem: '-100000', brk: '100000' }]);
    expect(await count(`from account_month where month = '2026-11-01'`)).toBe(2);
    // The cash forecast is kept for the next run, 60 days ahead.
    expect(
      await db.query(
        `select forecast->>'through' as through from engine_state where user_id = 'ana'`,
      ),
    ).toEqual([{ through: '2027-01-29' }]);
  });

  it('reads only the recent ledger day after day and leaves what reading it whole leaves', async () => {
    await db.query(
      `insert into price select $1, d::date, 11000000000, 'yahoo'
      from generate_series('2026-11-02'::date, '2026-12-31', '1 day') d where extract(isodow from d) < 6`,
      [world],
    );
    for (let d = '2026-11-01'; d <= '2026-12-15'; d = addDays(d, 1)) await runUser(db, 'ana', d);
    const snapshot = () =>
      Promise.all([
        db.query(
          `select account_id, instrument_id, qty_e8::text as q, cost_cents::text as c from position order by 1, 2`,
        ),
        db.query(
          `select day::text as d, total_cents::text as t, flows_cents::text as f from user_day order by 1`,
        ),
        db.query(
          `select account_id, month::text as m, value_cents::text as v from account_month order by 1, 2`,
        ),
        db.query(`select count(*)::int as n, sum(amount_cents)::text as s from movement`),
      ]);
    const compact = await snapshot();
    // Forcing a whole read (as after a change by hand) on the same day changes nothing.
    await db.query(
      `update engine_state set updated_at = '2000-01-01', processed_through = '2026-12-14'`,
    );
    await runUser(db, 'ana', '2026-12-15');
    expect(await snapshot()).toEqual(compact);
  });
});
