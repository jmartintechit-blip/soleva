import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAccount } from './accounts.ts';
import { amendClose, confirmClose } from './closes.ts';
import type { Db } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { createPgliteDb } from './db/pglite.ts';
import { deleteUser, endSessions, exportData, toCsv } from './privacy.ts';
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
  it('has everything the user wrote down, in cents, and nothing of anyone else', async () => {
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
      expect.objectContaining({ name: '=Banco, "mío"', balance_cents: 100_00, archived_at: null }),
    ]);
    expect(data.reglas).toEqual([
      expect.objectContaining({ name: 'Nómina', amount_cents: 150_000, start_month: '2026-01' }),
    ]);
    expect(data.cierres).toEqual([
      expect.objectContaining({ month: '2026-09', status: 'confirmado', confirmed_cents: 100_00 }),
    ]);
    expect(data.cierres[0]!.proposed_cents).toBe(123_45 + 150_000);
    expect(data.enmiendas).toEqual([
      expect.objectContaining({ month: '2026-09', new_cents: 100_00, reason: 'Olvidé un recibo' }),
    ]);
    expect(JSON.stringify(data)).not.toContain('eva');
  });

  it('writes CSV a spreadsheet opens safely', () => {
    expect(toCsv([{ a: '=SUM(A1)', b: 'x, "y"', c: -5, d: null }])).toBe(
      `a,b,c,d\r\n'=SUM(A1),"x, ""y""",-5,`,
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
