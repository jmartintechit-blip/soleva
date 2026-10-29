import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAccount } from './accounts.ts';
import { amendClose, confirmClose } from './closes.ts';
import type { Db } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { createPgliteDb } from './db/pglite.ts';
import { migrateUserToLedger } from './ledger-migration.ts';
import { EXPORT_TABLES, deleteUser, endSessions, exportData, toCsv } from './privacy.ts';
import { createRule } from './rules.ts';
import { saveAssumptions, saveReminder } from './settings.ts';

let db: Db;
const count = async (sql: string, params: unknown[] = []) =>
  Number((await db.query<{ n: number }>(`select count(*)::int as n ${sql}`, params))[0]!.n);

// Ana has one of everything; Eva's rows must survive Ana's deletion and stay out of her export.
beforeEach(async () => {
  db = createPgliteDb();
  await migrate(db);
  for (const id of ['ana', 'eva']) {
    await db.query(
      `insert into "user" (id, name, email, "emailVerified") values ($1, '', $2, true)`,
      [id, `${id}@example.com`],
    );
    await db.query(
      `insert into session (id, "expiresAt", token, "updatedAt", "userId")
       values ($1, now() + interval '1 day', $1, now(), $2), ($1 || '2', now() + interval '1 day', $1 || '2', now(), $2)`,
      [`s-${id}`, id],
    );
    await db.query(
      `insert into verification (id, identifier, value, "expiresAt")
       values ($1, $2, 'hash', now() + interval '10 minutes')`,
      [`v-${id}`, `sign-in-otp-${id}@example.com`],
    );
    const cash = await createAccount(db, id, {
      name: '=Banco, "mío"',
      kind: 'efectivo',
      balanceCents: 123_45,
      isEstimated: false,
      annualRateBp: 0,
    });
    await createRule(db, id, {
      name: 'Nómina',
      type: 'entra',
      amountCents: 150_000,
      frequency: 'mensual',
      day: 28,
      startMonth: '2026-01',
      active: true,
      fromAccountId: undefined,
      toAccountId: cash,
    });
    await confirmClose(db, id, '2026-09', {});
    await amendClose(db, id, '2026-09', cash, 100_00, 'Olvidé un recibo');
  }
  await saveAssumptions(db, 'ana', { prudente: 200, base: 500, optimista: 700, inflation: 200 });
  await saveReminder(db, 'ana', { enabled: false, day: 15 });
});
afterEach(() => db.close());

describe('exportData', () => {
  it('has everything the user wrote down, amounts in euros, and nothing of anyone else', async () => {
    const data = await exportData(db, 'ana');
    expect(data.ajustes).toEqual([
      expect.objectContaining({
        email: 'ana@example.com',
        base_bp: 500,
        reminder_day: 15,
        reminder_enabled: false,
      }),
    ]);
    expect(data.cuentas).toEqual([
      expect.objectContaining({ name: '=Banco, "mío"', balance_eur: 100, archived_at: null }),
    ]);
    expect(data.reglas).toEqual([
      expect.objectContaining({ name: 'Nómina', amount_eur: 1500, start_month: '2026-01' }),
    ]);
    expect(data.cierres).toEqual([
      expect.objectContaining({ month: '2026-09', status: 'confirmado', confirmed_eur: 100 }),
    ]);
    expect(data.cierres[0]!.proposed_eur).toBe(1623.45);
    expect(data.enmiendas).toEqual([
      expect.objectContaining({ month: '2026-09', new_eur: 100, reason: 'Olvidé un recibo' }),
    ]);
    expect(JSON.stringify(data)).not.toContain('eva');
  });

  it('exports the ledger and everything around it, only the user’s own, every table as CSV', async () => {
    const [{ id: etf }] = await db.query<{ id: string }>(
      `insert into instrument (kind, name, isin, currency, price_source, source_id)
       values ('etf', 'World', 'IE00B4L5Y983', 'USD', 'yahoo', 'IWDA.AS') returning id`,
    );
    for (const id of ['ana', 'eva']) {
      await migrateUserToLedger(db, id, '2026-10-01');
      const [{ id: cash }] = await db.query<{ id: string }>(
        `select id from money_account where user_id = $1`,
        [id],
      );
      await db.query(
        `insert into movement (account_id, day, kind, amount_cents, instrument_id, qty_e8, price_e8,
           fx_e8, source)
         values ($1, '2026-10-02', 'compra', -5025, $2, 50_000_000, 10_050_000_000, 108_500_000, 'manual')`,
        [cash, etf],
      );
      await db.query(
        `insert into price_override (user_id, instrument_id, day, close_e8) values ($1, $2, '2026-10-02', 10_100_000_000)`,
        [id, etf],
      );
      await db.query(
        `insert into alert (user_id, kind, day, dedupe_key) values ($1, 'precio_viejo', '2026-10-02', 'p')`,
        [id],
      );
    }

    const data = await exportData(db, 'ana');
    expect([...EXPORT_TABLES].sort()).toEqual(Object.keys(data).sort());
    expect(data.movimientos).toEqual([
      expect.objectContaining({ kind: 'apertura', amount_eur: 100, source: 'migracion' }),
      expect.objectContaining({
        kind: 'compra',
        amount_eur: -50.25,
        instrument: 'World',
        quantity: 0.5,
        price: 100.5,
        fx_per_eur: 1.085,
      }),
    ]);
    expect(data.reglas_auto).toEqual([
      expect.objectContaining({ name: 'Nómina', kind: 'ingreso', amount_eur: 1500 }),
    ]);
    expect(data.historico_mensual).toEqual([
      expect.objectContaining({ month: '2026-09', value_eur: 100 }),
    ]);
    expect(data.precios_propios).toEqual([expect.objectContaining({ price: 101 })]);
    expect(data.alertas).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain('eva');

    // Ana leaving takes her ledger; Eva's stays whole.
    await deleteUser(db, 'ana');
    expect((await exportData(db, 'eva')).movimientos).toHaveLength(2);
  });

  it('writes CSV a spreadsheet opens safely', () => {
    expect(toCsv([{ a: '=SUM(A1)', b: 'x; "y"', c: -5, d: null, e: 1623.45, f: 'a,b' }])).toBe(
      `a;b;c;d;e;f\r\n'=SUM(A1);"x; ""y""";-5;;1623,45;a,b`,
    );
    expect(toCsv([])).toBe('');
  });
});

describe('deleteUser', () => {
  it('removes every row of the user, pending codes included, and leaves others alone', async () => {
    await deleteUser(db, 'ana');
    for (const table of ['money_account', 'rule', 'month_close', 'settings'])
      expect(await count(`from ${table} where user_id = 'ana'`)).toBe(0);
    expect(await count(`from month_close_line where user_id = 'ana'`)).toBe(0);
    expect(await count(`from close_amendment`)).toBe(1);
    expect(await count(`from session where "userId" = 'ana'`)).toBe(0);
    expect(await count(`from "user" where id = 'ana'`)).toBe(0);
    expect(await count(`from verification where identifier like '%ana@%'`)).toBe(0);
    expect(await count(`from verification`)).toBe(1);
    expect((await exportData(db, 'eva')).cierres).toHaveLength(1);
  });
});

describe('endSessions', () => {
  it('ends every session of the user only', async () => {
    await endSessions(db, 'ana');
    expect(await count(`from session where "userId" = 'ana'`)).toBe(0);
    expect(await count(`from session where "userId" = 'eva'`)).toBe(2);
  });
});
