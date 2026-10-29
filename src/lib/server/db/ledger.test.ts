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

describe('ledger', () => {
  const account = async (user = 'ana', name = 'Banco') =>
    (
      await db.query<{ id: string }>(
        `insert into money_account (user_id, name, kind, balance_cents) values ($1, $2, 'efectivo', 0)
         returning id`,
        [user, name],
      )
    )[0]!.id;
  const move = (sql: string, params: unknown[]) =>
    db.query<{ id: string }>(`insert into movement ${sql} returning id`, params);

  it('balances every transfer at commit, and voiding takes both legs', async () => {
    const [a, b] = [await account(), await account('ana', 'Bróker')];
    const legs = `(account_id, day, kind, amount_cents, transfer_id, source)
      values ($1, '2026-11-01', 'transferencia', -180000, 't1', 'regla'),
             ($2, '2026-11-01', 'transferencia', 180000, 't1', 'regla')`;
    await db.transaction((tx) => tx.query(`insert into movement ${legs}`, [a, b]));
    // One leg alone, or legs that do not add up to zero, never reach the table.
    await expect(
      db.transaction((tx) =>
        tx.query(
          `insert into movement (account_id, day, kind, amount_cents, transfer_id, source)
           values ($1, '2026-11-02', 'transferencia', -5000, 't2', 'manual')`,
          [a],
        ),
      ),
    ).rejects.toThrow(/does not balance/);
    await expect(
      db.transaction((tx) =>
        tx.query(
          `insert into movement (account_id, day, kind, amount_cents, transfer_id, source)
           values ($1, '2026-11-02', 'transferencia', -5000, 't3', 'manual'),
                  ($2, '2026-11-02', 'transferencia', 4000, 't3', 'manual')`,
          [a, b],
        ),
      ),
    ).rejects.toThrow(/does not balance/);
    await expect(
      db.transaction((tx) =>
        tx.query(`update movement set voided_at = now() where account_id = $1`, [a]),
      ),
    ).rejects.toThrow(/does not balance/);
    await db.transaction((tx) => tx.query(`update movement set voided_at = now()`));
  });

  it('keeps buys as FIFO lots: append-only, provisional prices fixed once', async () => {
    const broker = await account();
    const [{ id: etf }] = await db.query<{ id: string }>(
      `insert into instrument (kind, name, currency, price_source, source_id)
       values ('etf', 'World', 'USD', 'yahoo', 'IWDA.AS') returning id`,
    );
    const [buy] = await move(
      `(account_id, day, seq, kind, amount_cents, instrument_id, qty_e8, price_e8, fx_e8, source,
        occurrence_key, provisional)
       values ($1, '2026-11-03', 0, 'compra', -5000, $2, 50_000_000, 10_000_000_000, 108_500_000,
               'regla', 'r1:2026-11-03:0', true)`,
      [broker, etf],
    );
    // Never twice for the same occurrence.
    await expect(
      move(
        `(account_id, day, kind, amount_cents, instrument_id, qty_e8, price_e8, source, occurrence_key)
         values ($1, '2026-11-03', 'compra', -5000, $2, 50_000_000, 10_000_000_000, 'regla', 'r1:2026-11-03:0')`,
        [broker, etf],
      ),
    ).rejects.toThrow();
    // A buy needs its units and price, with positive units and cash going out.
    await expect(
      move(
        `(account_id, day, kind, amount_cents, instrument_id, qty_e8, source)
         values ($1, '2026-11-03', 'compra', -5000, $2, 50_000_000, 'manual')`,
        [broker, etf],
      ),
    ).rejects.toThrow();

    await db.query(
      `update movement set price_e8 = 10_100_000_000, provisional = false where id = $1`,
      [buy!.id],
    );
    await expect(
      db.query(`update movement set price_e8 = 10_200_000_000 where id = $1`, [buy!.id]),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.query(`update movement set qty_e8 = 1 where id = $1`, [buy!.id]),
    ).rejects.toThrow(/append-only/);
    await expect(db.query(`delete from movement where id = $1`, [buy!.id])).rejects.toThrow(
      /append-only/,
    );
    await db.query(`update movement set voided_at = now() where id = $1`, [buy!.id]);
    await expect(
      db.query(`update movement set note = 'x' where id = $1`, [buy!.id]),
    ).rejects.toThrow(/voided/);

    // Deleting the user still takes her accounts and their whole ledger.
    await db.query(`insert into position values ($1, $2, 50_000_000, 5000)`, [broker, etf]);
    await db.query(
      `insert into engine_state (user_id, processed_through) values ('ana', '2026-11-03')`,
    );
    await db.query(`delete from "user" where id = 'ana'`);
    for (const t of ['movement', 'position', 'engine_state'])
      expect(await db.query(`select 1 from ${t}`)).toEqual([]);
  });
});

describe('auto rules', () => {
  const account = async (user: string, name: string) =>
    (
      await db.query<{ id: string }>(
        `insert into money_account (user_id, name, kind, balance_cents) values ($1, $2, 'efectivo', 0)
         returning id`,
        [user, name],
      )
    )[0]!.id;
  const rule = (values: string, params: unknown[]) =>
    db.query<{ id: string }>(
      `insert into auto_rule (user_id, name, kind, frequency, day, start_on, from_account_id,
         to_account_id, amount_cents) values ${values} returning id`,
      params,
    );

  it('fits each kind and frequency, and only with accounts its user can change', async () => {
    const [saving, broker, other] = [
      await account('ana', 'Remunerada'),
      await account('ana', 'Bróker'),
      await account('eva', 'De Eva'),
    ];
    await rule(
      `('ana', 'Al bróker', 'transferencia', 'mensual', 1, '2026-11-01', $1, $2, 180000)`,
      [saving, broker],
    );
    const [plan] = await rule(
      `('ana', 'Plan', 'plan', 'semanal', 1, '2026-11-02', $1, null, null)`,
      [broker],
    );
    const [{ id: etf }] = await db.query<{ id: string }>(
      `insert into instrument (kind, name, currency, price_source, source_id)
       values ('etf', 'World', 'USD', 'yahoo', 'IWDA.AS') returning id`,
    );
    await db.query(`insert into auto_rule_leg values ($1, 0, $2, 5000)`, [plan!.id, etf]);
    await expect(
      db.query(`insert into auto_rule_leg values ($1, 1, $2, 5000)`, [plan!.id, etf]),
    ).rejects.toThrow();

    for (const [values, params] of [
      // Weekly on day 8, a plan with an amount, a transfer to itself, an income without account.
      [`('ana', 'x', 'gasto', 'semanal', 8, '2026-11-01', $1, null, 100)`, [saving]],
      [`('ana', 'x', 'plan', 'mensual', 1, '2026-11-01', $1, null, 100)`, [broker]],
      [`('ana', 'x', 'transferencia', 'mensual', 1, '2026-11-01', $1, $1, 100)`, [saving]],
      [`('ana', 'x', 'ingreso', 'quincenal', null, '2026-11-01', null, null, 100)`, []],
      // Someone else's account, even with its real id.
      [`('ana', 'x', 'gasto', 'mensual', 1, '2026-11-01', $1, null, 100)`, [other]],
    ] as const)
      await expect(rule(values, [...params])).rejects.toThrow();

    // Its movements keep a rule from being deleted; deleting the user still takes everything.
    await db.query(
      `insert into movement (account_id, day, kind, amount_cents, source, rule_id, occurrence_key)
       values ($1, '2026-11-03', 'gasto', -100, 'regla', $2, 'x')`,
      [broker, plan!.id],
    );
    await expect(db.query(`delete from auto_rule where id = $1`, [plan!.id])).rejects.toThrow();
    await db.query(`delete from "user" where id = 'ana'`);
    expect(await db.query(`select 1 from auto_rule`)).toEqual([]);
  });
});

describe('products', () => {
  const account = async (kind = 'remunerada') =>
    (
      await db.query<{ id: string }>(
        `insert into money_account (user_id, name, kind, balance_cents) values ('ana', 'C', $1, 0)
         returning id`,
        [kind],
      )
    )[0]!.id;

  it('takes interest tiers, a promotion with its end and the 19 % withheld by default', async () => {
    const id = await account();
    await db.query(
      `insert into interest_config (account_id, promo_until, after_rate_bp) values ($1, '2027-03-31', 150)`,
      [id],
    );
    await db.query(`insert into interest_tier values ($1, 5_000_000, 250), ($1, null, 0)`, [id]);
    await expect(
      db.query(`insert into interest_tier values ($1, null, 100)`, [id]),
    ).rejects.toThrow();
    expect(await db.query(`select withholding_bp, base_days from interest_config`)).toEqual([
      { withholding_bp: 1900, base_days: 365 },
    ]);
    await expect(
      db.query(`insert into interest_config (account_id, promo_until) values ($1, '2027-01-01')`, [
        await account(),
      ]),
    ).rejects.toThrow();
  });

  it('describes fixed and variable debts, and negative Euribor months', async () => {
    const [loan, payer] = [await account('deuda_prestamo'), await account('efectivo')];
    await db.query(`insert into index_rate values ('euribor_12m', '2021-04-01', -48)`);
    await db.query(
      `insert into debt (account_id, principal_cents, start_on, first_payment_on, term_months,
         rate_type, initial_rate_bp, index, spread_bp, review_months, payer_account_id)
       values ($1, 15_000_000, '2026-01-15', '2026-02-15', 300, 'variable', 250, 'euribor_12m', 80,
               12, $2)`,
      [loan, payer],
    );
    // A variable rate without its index, or a floor on a fixed one, is refused.
    for (const extra of [
      `'variable', 250, null, null, null, null`,
      `'fijo', 250, null, null, null, 100`,
    ])
      await expect(
        db.query(
          `insert into debt (account_id, principal_cents, start_on, first_payment_on, term_months,
             rate_type, initial_rate_bp, index, spread_bp, review_months, floor_bp)
           values ($1, 100, '2026-01-01', '2026-02-01', 12, ${extra})`,
          [await account('deuda_prestamo')],
        ),
      ).rejects.toThrow();
    // Deleting the account that pays leaves the debt without a payer, not without its history.
    await db.query(`delete from money_account where id = $1`, [payer]);
    expect(await db.query(`select payer_account_id from debt`)).toEqual([
      { payer_account_id: null },
    ]);
  });

  it('keeps dividends and estimates per holding', async () => {
    const id = await account('broker');
    const [{ id: bank }] = await db.query<{ id: string }>(
      `insert into instrument (kind, name, currency, price_source, source_id)
       values ('accion', 'Banco', 'EUR', 'yahoo', 'SAN.MC') returning id`,
    );
    await db.query(
      `insert into dividend_config (account_id, instrument_id, per_unit_e8, pay_months, pay_day)
       values ($1, $2, 10_000_000, '{5,11}', 2)`,
      [id, bank],
    );
    await expect(
      db.query(
        `insert into dividend_config (account_id, instrument_id, per_unit_e8, pay_months, pay_day)
         values ($1, $2, 10_000_000, '{13}', 2)`,
        [await account('broker'), bank],
      ),
    ).rejects.toThrow();
    const [{ id: pm }] = await db.query<{ id: string }>(
      `insert into instrument (kind, name, currency, owner_user_id)
       values ('estimado', 'Private markets', 'EUR', 'ana') returning id`,
    );
    await db.query(`insert into estimate_config values ($1, $2, 900)`, [id, pm]);
    await db.query(`delete from "user" where id = 'ana'`);
    for (const t of [
      'dividend_config',
      'estimate_config',
      'instrument where owner_user_id is not null',
    ])
      expect(await db.query(`select 1 from ${t}`)).toEqual([]);
  });
});

describe('valuation', () => {
  it('links a car to its Hacienda model and keeps goods on a curve per kind', async () => {
    const [{ id: car }] = await db.query<{ id: string }>(
      `insert into money_account (user_id, name, kind, balance_cents) values ('ana', 'Coche', 'vehiculo', 0)
       returning id`,
    );
    const [{ id: model }] = await db.query<{ id: string }>(
      `insert into vehicle_base (order_year, brand, model, period, fuel, cc, kw, value_cents)
       values (2026, 'MARCA', 'MODELO 1.6 TDI', '2012-2015', 'D', 1598, 77, 2_150_000) returning id`,
    );
    await db.query(`insert into vehicle_depreciation values (2026, 12, 1000)`);
    await db.query(`insert into vehicle values ($1, $2, '2013-05-10', null)`, [car, model]);
    // The table of a new year replaces the old one: the car stays, waiting for its new model.
    await db.query(`delete from vehicle_base`);
    expect(await db.query(`select vehicle_base_id from vehicle`)).toEqual([
      { vehicle_base_id: null },
    ]);

    expect(await db.query(`select pct_bp from asset_curve where category = 'joyas'`)).toEqual([
      { pct_bp: 10000 },
    ]);
    await expect(
      db.query(`insert into asset values ($1, 'barco', 100, '2026-01-01')`, [car]),
    ).rejects.toThrow();
  });
});
