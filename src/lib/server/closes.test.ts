import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAccount, deleteAccount, getAccount } from './accounts.ts';
import {
  amendClose,
  confirmClose,
  getClose,
  lastClosedMonth,
  monthToClose,
  netWorthHistory,
  proposeClose,
} from './closes.ts';
import type { Db } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { createPgliteDb } from './db/pglite.ts';
import { createRule } from './rules.ts';

describe('monthToClose', () => {
  it('closes the previous month during the first 10 days, else the current one', () => {
    expect(monthToClose('2026-11-03')).toBe('2026-10');
    expect(monthToClose('2026-11-03', '2026-10')).toBe('2026-11');
    expect(monthToClose('2026-11-11')).toBe('2026-11');
    expect(monthToClose('2026-01-10', '2025-11')).toBe('2025-12');
    expect(monthToClose('2026-11-20', '2026-11')).toBeNull();
  });
});

let db: Db;
let cash: string;
let fund: string;
let loan: string;
beforeEach(async () => {
  db = createPgliteDb();
  await migrate(db);
  for (const id of ['ana', 'eva'])
    await db.query(
      `insert into "user" (id, name, email, "emailVerified") values ($1, '', $2, true)`,
      [id, `${id}@example.com`],
    );
  const base = { isEstimated: false, annualRateBp: 0 };
  cash = await createAccount(db, 'ana', {
    ...base,
    name: 'Banco',
    kind: 'efectivo',
    balanceCents: 200_000,
  });
  fund = await createAccount(db, 'ana', {
    ...base,
    name: 'Fondo',
    kind: 'inversion',
    balanceCents: 1_000_000,
    annualRateBp: 600,
  });
  loan = await createAccount(db, 'ana', {
    ...base,
    name: 'Préstamo',
    kind: 'deuda',
    balanceCents: 50_000,
    annualRateBp: 1200,
  });
  const rule = { frequency: 'mensual', day: 1, startMonth: '2026-01', active: true } as const;
  await createRule(db, 'ana', {
    ...rule,
    name: 'Nómina',
    type: 'entra',
    amountCents: 150_000,
    fromAccountId: undefined,
    toAccountId: cash,
  });
  await createRule(db, 'ana', {
    ...rule,
    name: 'Fondo',
    type: 'mueve',
    amountCents: 30_000,
    fromAccountId: cash,
    toAccountId: fund,
  });
  await createRule(db, 'ana', {
    ...rule,
    name: 'Cuota',
    type: 'mueve',
    amountCents: 10_000,
    fromAccountId: cash,
    toAccountId: loan,
  });
});
afterEach(() => db.close());

describe('closes', () => {
  it('proposes from the rules plus the month accrual, in whole cents', async () => {
    const lines = await proposeClose(db, 'ana', '2026-10');
    const by = Object.fromEntries(lines.map((l) => [l.account.id, l]));
    expect(by[cash]).toMatchObject({
      rulesCents: 110_000,
      accrualCents: 0,
      proposedCents: 310_000,
    });
    expect(by[fund]!.rulesCents).toBe(30_000);
    expect(Number.isInteger(by[fund]!.accrualCents)).toBe(true);
    // Debt interest adds to what is owed and is shown apart.
    expect(by[loan]).toMatchObject({ rulesCents: -10_000, accrualCents: 380 });
    expect(by[loan]!.proposedCents).toBe(40_380);
  });

  it('confirms once, with corrections, moving the balances and the history', async () => {
    expect(await confirmClose(db, 'ana', '2026-10', { [cash]: 300_000 })).toBe(true);
    expect(await confirmClose(db, 'ana', '2026-10', {})).toBe(false);
    expect(await lastClosedMonth(db, 'ana')).toBe('2026-10');
    expect((await getAccount(db, 'ana', cash))!.balanceCents).toBe(300_000);
    const close = (await getClose(db, 'ana', '2026-10'))!;
    expect(close.lines.find((l) => l.accountId === cash)).toMatchObject({
      proposedCents: 310_000,
      confirmedCents: 300_000,
      isDebt: false,
    });
    const fundCents = close.lines.find((l) => l.accountId === fund)!.confirmedCents;
    const [h] = await netWorthHistory(db, 'ana');
    expect(h).toEqual({
      month: '2026-10',
      assetsCents: 300_000 + fundCents,
      debtsCents: 40_380,
      netCents: 300_000 + fundCents - 40_380,
    });
  });

  it('amends with a trace; only the latest month moves the account', async () => {
    await confirmClose(db, 'ana', '2026-10', {});
    await confirmClose(db, 'ana', '2026-11', {});
    const now = (await getAccount(db, 'ana', cash))!.balanceCents;
    expect(await amendClose(db, 'ana', '2026-10', cash, 1, 'Faltaba un cargo')).toBe(true);
    expect((await getAccount(db, 'ana', cash))!.balanceCents).toBe(now);
    expect(await amendClose(db, 'ana', '2026-11', cash, 2, 'Otro')).toBe(true);
    expect((await getAccount(db, 'ana', cash))!.balanceCents).toBe(2);
    const line = (await getClose(db, 'ana', '2026-10'))!.lines.find((l) => l.accountId === cash)!;
    expect(line.confirmedCents).toBe(1);
    expect(line.amendments).toMatchObject([
      { previousCents: 310_000, newCents: 1, reason: 'Faltaba un cargo' },
    ]);
  });

  it("never shows or amends someone else's close", async () => {
    await confirmClose(db, 'ana', '2026-10', {});
    expect(await getClose(db, 'eva', '2026-10')).toBeNull();
    expect(await amendClose(db, 'eva', '2026-10', cash, 1, 'x')).toBe(false);
    expect(await amendClose(db, 'ana', '2026-09', cash, 1, 'x')).toBe(false);
    expect(await netWorthHistory(db, 'eva')).toEqual([]);
  });

  it('keeps accounts in a closed month: delete says so, archive still works', async () => {
    await confirmClose(db, 'ana', '2026-10', {});
    expect(await deleteAccount(db, 'ana', cash)).toBe('closed');
    expect(await getAccount(db, 'ana', cash)).not.toBeNull();
  });
});
