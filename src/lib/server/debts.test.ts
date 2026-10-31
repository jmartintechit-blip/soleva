import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openAccount } from './alta.ts';
import type { Db } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { createPgliteDb } from './db/pglite.ts';
import { debtView, readDebtForm, saveDebt } from './debts.ts';
import { runUser } from './engine-run.ts';
import { createProperty } from './property.ts';

let db: Db;
let bank: string;
let loan: string;
let hers: string;
beforeEach(async () => {
  db = createPgliteDb();
  await migrate(db);
  for (const id of ['ana', 'eva'])
    await db.query(
      `insert into "user" (id, name, email, "emailVerified") values ($1, '', $2, true)`,
      [id, `${id}@x.es`],
    );
  await db.query(
    `insert into engine_state (user_id, processed_through) values ('ana', '2026-10-31')`,
  );
  bank = await openAccount(db, 'ana', '2026-10-31', {
    name: 'Bankinter',
    kind: 'efectivo',
    cents: 500_000,
  });
  // From the Alta: what is owed, nothing else yet.
  loan = await openAccount(db, 'ana', '2026-10-31', {
    name: 'Hipoteca del piso',
    kind: 'deuda_hipoteca',
    cents: 14_000_000,
  });
  hers = await openAccount(db, 'eva', '2026-10-31', { name: 'Suya', kind: 'efectivo', cents: 1 });
});
afterEach(() => db.close());

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const fixed = () => ({
  tipo: 'fijo',
  capital: '150.000',
  desde: '2024-07',
  anos: '25',
  tipo_fijo: '2,6',
  paga: bank,
  dia: '1',
});

describe('debts', () => {
  it('reads fixed and variable terms, and what is missing', () => {
    expect(readDebtForm(form(fixed()))).toMatchObject({
      ok: true,
      input: {
        principalCents: 15_000_000,
        startMonth: '2024-07',
        termMonths: 300,
        rateType: 'fijo',
        initialRateBp: 260,
        spreadBp: null,
      },
    });
    expect(
      readDebtForm(
        form({
          ...fixed(),
          tipo: 'variable',
          tipo_inicial: '3,1',
          diferencial: '0,8',
          revision: '12',
          suelo: '0',
        }),
      ),
    ).toMatchObject({
      ok: true,
      input: {
        rateType: 'variable',
        initialRateBp: 310,
        spreadBp: 80,
        reviewMonths: 12,
        floorBp: 0,
      },
    });
    const bad = readDebtForm(
      form({ tipo: 'variable', capital: '0', desde: '2024-13', anos: '60', dia: '0' }),
    );
    expect(Object.keys(bad.ok ? {} : bad.errors).sort()).toEqual(
      ['anos', 'capital', 'desde', 'dia', 'diferencial', 'paga', 'revision', 'tipo_inicial'].sort(),
    );
  });

  it('owes what the schedule says today, then each payment splits into interest and principal', async () => {
    const read = readDebtForm(form(fixed()));
    if (!read.ok) throw new Error('form');
    expect(await saveDebt(db, 'ana', loan, '2026-10-31', read.input)).toBe(true);
    const v = (await debtView(db, 'ana', loan, '2026-10-31'))!;
    // 150.000 € at 2,6 % for 25 years from August 2024: 27 payments made by October 2026.
    expect(v.account.cents).toBe(-v.ahead[0]!.outstandingCents - v.ahead[0]!.principalCents);
    expect(v.next).toMatchObject({ day: '2026-11-01' });
    expect(v.next!.paymentCents).toBe(68_050);
    expect(v.ahead).toHaveLength(273);
    expect(
      await db.query(`select kind, note from movement where account_id = $1 order by created_at`, [
        loan,
      ]),
    ).toEqual([
      { kind: 'apertura', note: null },
      { kind: 'ajuste', note: 'condiciones' },
    ]);
    await runUser(db, 'ana', '2026-11-01');
    const paid = await db.query<{ account_id: string; kind: string; cents: number }>(
      `select account_id, kind, amount_cents::int as cents from movement
       where day = '2026-11-01' and source = 'motor' order by kind, account_id`,
    );
    expect(paid).toEqual(
      expect.arrayContaining([
        { account_id: bank, kind: 'gasto', cents: -v.next!.interestCents },
        { account_id: loan, kind: 'amortizacion', cents: v.next!.principalCents },
      ]),
    );
    // Saving the same again changes nothing.
    await saveDebt(db, 'ana', loan, '2026-11-01', read.input);
    expect(
      await db.query(
        `select count(*)::int as n from movement where account_id = $1 and kind = 'ajuste'`,
        [loan],
      ),
    ).toEqual([{ n: 1 }]);
  });

  it('links its home, and refuses what is not the user’s', async () => {
    await db.query(`insert into municipality values ('41039', 'Écija', 'ecija', '01')`);
    const home = (await createProperty(db, 'ana', '2026-10-31', {
      name: 'Piso',
      kind: 'habitual',
      municipalityCode: '41039',
      areaM2: 90,
      method: 'propio',
      ownCents: 20_000_000,
      growthBp: 200,
    })) as string;
    const read = readDebtForm(form({ ...fixed(), inmueble: home }));
    if (!read.ok) throw new Error('form');
    expect(await saveDebt(db, 'ana', loan, '2026-10-31', read.input)).toBe(true);
    expect(
      await db.query(`select mortgage_account_id from property where account_id = $1`, [home]),
    ).toEqual([{ mortgage_account_id: loan }]);
    await saveDebt(db, 'ana', loan, '2026-10-31', { ...read.input, propertyId: null });
    expect(
      await db.query(`select mortgage_account_id from property where account_id = $1`, [home]),
    ).toEqual([{ mortgage_account_id: null }]);
    expect(
      await saveDebt(db, 'ana', loan, '2026-10-31', { ...read.input, payerAccountId: hers }),
    ).toBeNull();
    expect(await saveDebt(db, 'eva', loan, '2026-10-31', read.input)).toBeNull();
    expect(await debtView(db, 'ana', bank, '2026-10-31')).toBeNull();
  });
});
