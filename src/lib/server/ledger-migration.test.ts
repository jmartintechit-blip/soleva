import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAccount, listAccounts, setArchived } from './accounts.ts';
import { amendClose, confirmClose, netWorthHistory } from './closes.ts';
import type { Db } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { createPgliteDb } from './db/pglite.ts';
import { migrateUserToLedger } from './ledger-migration.ts';
import { createRule } from './rules.ts';

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

const base = { isEstimated: false, annualRateBp: 0 };
const TODAY = '2026-11-15';

// Net worth from the ledger: the plain sum of every account's movements.
const ledgerNet = async (userId: string) =>
  Number(
    (
      await db.query<{ n: string }>(
        `select coalesce(sum(m.amount_cents), 0)::text as n from movement m
         join money_account a on a.id = m.account_id where a.user_id = $1`,
        [userId],
      )
    )[0]!.n,
  );

describe('migrateUserToLedger', () => {
  it('loses nothing: balances, rules and closed months are the same after the cut-over', async () => {
    const cash = await createAccount(db, 'ana', {
      ...base,
      name: 'Banco',
      kind: 'efectivo',
      balanceCents: 200_037,
    });
    const fund = await createAccount(db, 'ana', {
      ...base,
      name: 'Fondo',
      kind: 'inversion',
      balanceCents: 1_000_000,
    });
    const loan = await createAccount(db, 'ana', {
      ...base,
      name: 'Préstamo',
      kind: 'deuda',
      balanceCents: 50_000,
    });
    const old = await createAccount(db, 'ana', {
      ...base,
      name: 'Vieja',
      kind: 'otro',
      balanceCents: 7_000,
    });
    await setArchived(db, 'ana', old, true);
    const rule = { day: 31, startMonth: '2026-01', active: true } as const;
    await createRule(db, 'ana', {
      ...rule,
      name: 'Nómina',
      type: 'entra',
      frequency: 'mensual',
      amountCents: 150_000,
      fromAccountId: undefined,
      toAccountId: cash,
    });
    await createRule(db, 'ana', {
      ...rule,
      name: 'Aportación',
      type: 'mueve',
      frequency: 'mensual',
      amountCents: 30_000,
      fromAccountId: cash,
      toAccountId: fund,
      endMonth: '2027-02',
    });
    await createRule(db, 'ana', {
      ...rule,
      name: 'Seguro',
      type: 'sale',
      frequency: 'una_vez',
      startMonth: '2027-02',
      amountCents: 40_000,
      fromAccountId: cash,
      toAccountId: undefined,
      active: false,
    });
    await confirmClose(db, 'ana', '2026-10', {
      [cash]: 200_037,
      [fund]: 1_000_000,
      [loan]: 50_000,
    });
    await amendClose(db, 'ana', '2026-10', cash, 199_000, 'Un recibo');
    await createAccount(db, 'eva', { ...base, name: 'De Eva', kind: 'efectivo', balanceCents: 1 });

    const accountsBefore = await listAccounts(db, 'ana');
    const net = accountsBefore.reduce(
      (s, a) => s + (a.kind === 'deuda' ? -a.balanceCents : a.balanceCents),
      0,
    );
    const history = await netWorthHistory(db, 'ana');

    expect(await migrateUserToLedger(db, 'ana', TODAY)).toBe(true);

    expect(await ledgerNet('ana')).toBe(net);
    expect(
      await db.query(
        `select a.name, a.kind, m.day::text as day, m.amount_cents::float8 as amount, m.source
         from movement m join money_account a on a.id = m.account_id
         where a.user_id = 'ana' order by a.created_at`,
      ),
    ).toEqual([
      { name: 'Banco', kind: 'efectivo', day: TODAY, amount: 199_000, source: 'migracion' },
      { name: 'Fondo', kind: 'broker', day: TODAY, amount: 1_000_000, source: 'migracion' },
      {
        name: 'Préstamo',
        kind: 'deuda_prestamo',
        day: TODAY,
        amount: -50_000,
        source: 'migracion',
      },
      { name: 'Vieja', kind: 'bien', day: TODAY, amount: 7_000, source: 'migracion' },
    ]);
    expect(
      await db.query(
        `select name, kind, frequency, day, start_on::text as "startOn", end_on::text as "endOn",
           amount_cents::float8 as amount, active
         from auto_rule order by name`,
      ),
    ).toEqual([
      {
        name: 'Aportación',
        kind: 'transferencia',
        frequency: 'mensual',
        day: 31,
        startOn: '2026-01-01',
        endOn: '2027-02-28',
        amount: 30_000,
        active: true,
      },
      {
        name: 'Nómina',
        kind: 'ingreso',
        frequency: 'mensual',
        day: 31,
        startOn: '2026-01-01',
        endOn: null,
        amount: 150_000,
        active: true,
      },
      {
        name: 'Seguro',
        kind: 'gasto',
        frequency: 'una_vez',
        day: null,
        startOn: '2027-02-28',
        endOn: null,
        amount: 40_000,
        active: false,
      },
    ]);
    // The closed month, with its amendment, is the same net worth in the new history.
    const [month] = await db.query<{ n: string }>(
      `select sum(value_cents)::text as n from account_month where month = '2026-10-01'`,
    );
    expect(Number(month!.n)).toBe(history[0]!.netCents);
    expect(
      await db.query(`select processed_through::text as d from engine_state where user_id = 'ana'`),
    ).toEqual([{ d: TODAY }]);

    // Twice is once, and nobody else is touched.
    expect(await migrateUserToLedger(db, 'ana', '2026-11-16')).toBe(false);
    expect(await ledgerNet('ana')).toBe(net);
    expect(await ledgerNet('eva')).toBe(0);
    expect(await db.query(`select 1 from auto_rule where user_id = 'eva'`)).toEqual([]);
  });
});
