import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openAccount } from './alta.ts';
import type { Db } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { createPgliteDb } from './db/pglite.ts';
import { runUser } from './engine-run.ts';
import { readTermsForm, saveTerms, termsView } from './interest-terms.ts';

let db: Db;
let bank: string;
beforeEach(async () => {
  db = createPgliteDb();
  await migrate(db);
  for (const id of ['ana', 'eva'])
    await db.query(
      `insert into "user" (id, name, email, "emailVerified") values ($1, '', $2, true)`,
      [id, `${id}@x.es`],
    );
  await db.query(
    `insert into engine_state (user_id, processed_through) values ('ana', '2026-10-01')`,
  );
  // 38.240,15 € at 2 %, monthly on the last day (the Alta's defaults).
  bank = await openAccount(db, 'ana', '2026-10-01', {
    name: 'Bankinter',
    kind: 'remunerada',
    cents: 3_824_015,
    rateBp: 200,
  });
});
afterEach(() => db.close());

const form = (fields: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of fields) f.append(k, v);
  return f;
};

describe('interest terms', () => {
  it('shows this period’s interest on each day’s balance, from the day it opened', async () => {
    const v = (await termsView(db, 'ana', bank, '2026-10-15'))!;
    expect(v.terms).toMatchObject({ payFrequency: 'mensual', payDay: 31, withholdingBp: 1900 });
    expect(v.period).toMatchObject({ from: '2026-10-01', to: '2026-10-15', payOn: '2026-10-31' });
    // 15 days at 2 % / 365 on 38.240,15 €: 31,43 € gross.
    expect(v.period.gross).toBe(Math.floor((3_824_015 * 0.02 * 15) / 365));
    expect(v.period.withheld + v.period.net).toBe(v.period.gross);
    expect(v.averageCents).toBe(3_824_015);
    expect(await termsView(db, 'eva', bank, '2026-10-15')).toBeNull();
  });

  it('on its pay day, shows what was paid', async () => {
    await runUser(db, 'ana', '2026-10-31');
    const v = (await termsView(db, 'ana', bank, '2026-10-31'))!;
    const [paid] = await db.query<{ net: number; w: number }>(
      `select amount_cents::int as net, withholding_cents::int as w from movement where kind = 'interes'`,
    );
    expect(v.period).toMatchObject({ payOn: '2026-10-31', net: paid!.net, withheld: paid!.w });
    expect(v.account.cents).toBe(3_824_015 + paid!.net);
  });

  it('reads and saves tiers, promotion and how it pays; only the user’s own', async () => {
    const read = readTermsForm(
      form([
        ['tier_upto', '50.000'],
        ['tier_rate', '2'],
        ['tier_upto', ''],
        ['tier_rate', '0'],
        ['promo', 'on'],
        ['promo_until', '2026-12-31'],
        ['after_rate', '0,5'],
        ['pay_frequency', 'mensual'],
        ['pay_day', '1'],
        ['base_days', '365'],
        ['withholding', '19'],
      ]),
    );
    expect(read).toMatchObject({
      ok: true,
      input: {
        tiers: [
          { upToCents: 5_000_000, rateBp: 200 },
          { upToCents: null, rateBp: 0 },
        ],
        promoUntil: '2026-12-31',
        afterRateBp: 50,
        payDay: 1,
      },
    });
    if (!read.ok) return;
    expect(await saveTerms(db, 'eva', bank, read.input)).toBeNull();
    expect(await saveTerms(db, 'ana', bank, read.input)).toBe(true);
    expect((await termsView(db, 'ana', bank, '2026-10-15'))!.terms).toMatchObject({
      payDay: 1,
      promoUntil: '2026-12-31',
      afterRateBp: 50,
      tiers: [
        { upToCents: 5_000_000, rateBp: 200 },
        { upToCents: null, rateBp: 0 },
      ],
    });
    const bad = readTermsForm(
      form([
        ['tier_upto', '50.000'],
        ['tier_rate', '2'],
        ['tier_upto', '10.000'],
        ['tier_rate', '1'],
        ['tier_upto', ''],
        ['tier_rate', '0'],
        ['promo', 'on'],
        ['pay_frequency', 'semanal'],
        ['pay_day', '1'],
        ['withholding', '120'],
      ]),
    );
    expect(bad.ok ? {} : bad.errors).toEqual({
      tiers: 'Cada tramo llega más alto que el anterior',
      promo: 'Elige hasta cuándo dura la promoción',
      pay: 'Elige cuándo paga',
      withholding: 'Escribe la retención, por ejemplo 19',
    });
    const car = await openAccount(db, 'ana', '2026-10-01', {
      name: 'Coche',
      kind: 'vehiculo',
      cents: 1,
    });
    expect(await saveTerms(db, 'ana', car, read.input)).toBeNull();
    expect(await termsView(db, 'ana', car, '2026-10-15')).toBeNull();
  });
});
