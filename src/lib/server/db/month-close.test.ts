import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './index.ts';
import { migrate } from './migrate.ts';
import { createPgliteDb } from './pglite.ts';

// Invariants (b) and (c) live in migration 0005; these tests hit the SQL directly.
let db: Db;
let close: string;
const cash = async () =>
  (
    await db.query<{ c: number }>(
      `select confirmed_cents::float8 as c from month_close_line where account_id = 'cash'`,
    )
  )[0]?.c;

beforeEach(async () => {
  db = createPgliteDb();
  await migrate(db);
  await db.query(
    `insert into "user" (id, name, email, "emailVerified") values ('ana', '', 'ana@example.com', true)`,
  );
  await db.query(`insert into money_account (id, user_id, name, kind, balance_cents) values
    ('cash', 'ana', 'Cuenta', 'efectivo', 100000), ('loan', 'ana', 'Préstamo', 'deuda', 30000),
    ('later', 'ana', 'Nueva', 'otro', 0)`);
  const [row] = await db.query<{ id: string }>(
    `insert into month_close (user_id, month) values ('ana', '2026-10-01') returning id`,
  );
  close = row!.id;
  await db.query(
    `insert into month_close_line (close_id, user_id, account_id, is_debt, proposed_cents, confirmed_cents)
     values ($1, 'ana', 'cash', false, 100000, 100000), ($1, 'ana', 'loan', true, 30000, 30000)`,
    [close],
  );
});
afterEach(() => db.close());

const confirm = () =>
  db.query(`update month_close set status = 'confirmado', confirmed_at = now() where id = $1`, [
    close,
  ]);
const netWorth = () =>
  db.query(`select net_cents::float8 as net from net_worth_monthly where user_id = 'ana'`);

describe('month_close', () => {
  it('lets a draft change freely and leaves it out of the history', async () => {
    await db.query(
      `update month_close_line set confirmed_cents = 90000 where close_id = $1 and account_id = 'cash'`,
      [close],
    );
    expect(await cash()).toBe(90000);
    expect(await netWorth()).toEqual([]);
  });

  it('counts net worth as assets minus debts once confirmed', async () => {
    await confirm();
    expect(await netWorth()).toEqual([{ net: 70000 }]);
  });

  it('refuses any direct change to a confirmed close', async () => {
    await confirm();
    const attempts = [
      `update month_close_line set confirmed_cents = 1 where close_id = '${close}'`,
      `delete from month_close_line where close_id = '${close}'`,
      `insert into month_close_line values ('${close}', 'ana', 'later', false, 0, 0)`,
      `update month_close set status = 'borrador', confirmed_at = null where id = '${close}'`,
      `delete from month_close where id = '${close}'`,
    ];
    for (const sql of attempts) await expect(db.query(sql)).rejects.toThrow();
    expect(await netWorth()).toEqual([{ net: 70000 }]);
  });

  it('changes a confirmed balance only through an amendment that keeps the trace', async () => {
    await expect(
      db.query(
        `insert into close_amendment (close_id, account_id, previous_cents, new_cents, reason)
        values ($1, 'cash', 0, 1, 'borrador')`,
        [close],
      ),
    ).rejects.toThrow('only confirmed');
    await confirm();
    // previous_cents comes from the line, not from the caller.
    await db.query(
      `insert into close_amendment (close_id, account_id, previous_cents, new_cents, reason)
       values ($1, 'cash', 5, 95000, 'Faltaba un cargo')`,
      [close],
    );
    expect(await cash()).toBe(95000);
    expect(await netWorth()).toEqual([{ net: 65000 }]);
    expect(
      await db.query(
        `select previous_cents::float8 as p, new_cents::float8 as n from close_amendment`,
      ),
    ).toEqual([{ p: 100000, n: 95000 }]);
    await expect(db.query(`update close_amendment set reason = 'otra'`)).rejects.toThrow();
    await expect(db.query(`delete from close_amendment`)).rejects.toThrow();
    // The flag is local to the amendment: a plain update right after still fails.
    await expect(
      db.query(`update month_close_line set confirmed_cents = 1 where close_id = $1`, [close]),
    ).rejects.toThrow();
  });

  it('keeps accounts with closes from being deleted, but deleting the user removes everything', async () => {
    await confirm();
    await db.query(
      `insert into close_amendment (close_id, account_id, previous_cents, new_cents, reason)
      values ($1, 'cash', 0, 1, 'x')`,
      [close],
    );
    await expect(db.query(`delete from money_account where id = 'cash'`)).rejects.toThrow();
    await db.query(`delete from "user" where id = 'ana'`);
    for (const t of ['month_close', 'month_close_line', 'close_amendment'])
      expect(await db.query(`select 1 from ${t}`)).toEqual([]);
  });
});
