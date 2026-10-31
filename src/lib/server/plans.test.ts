import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toE8 } from '#lib/engine/units.ts';
import { openAccount } from './alta.ts';
import { saveAutoRule } from './auto-rules.ts';
import type { Db } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { createPgliteDb } from './db/pglite.ts';
import { nextWeekday, planContext, planLegs, readPlanForm, savePlan } from './plans.ts';

let db: Db;
let bank: string;
let broker: string;
let hers: string;
beforeEach(async () => {
  db = createPgliteDb();
  await migrate(db);
  for (const id of ['ana', 'eva'])
    await db.query(
      `insert into "user" (id, name, email, "emailVerified") values ($1, '', $2, true)`,
      [id, `${id}@x.es`],
    );
  bank = await openAccount(db, 'ana', '2026-11-02', {
    name: 'Bankinter',
    kind: 'efectivo',
    cents: 500_000,
  });
  broker = await openAccount(db, 'ana', '2026-11-02', {
    name: 'Trade Republic',
    kind: 'broker',
    cents: 20_000,
  });
  hers = await openAccount(db, 'eva', '2026-11-02', { name: 'Suya', kind: 'broker', cents: 0 });
});
afterEach(() => db.close());

const form = (fields: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of fields) f.append(k, v);
  return f;
};
// What the provider would say about a listing.
const quoteOf = (symbol: string, name: string) => ({
  quote: {
    symbol,
    exchange: 'GER',
    market: 'XETRA',
    name,
    kind: 'etf' as const,
    isin: 'IE00B4L5Y983',
    currency: 'EUR',
    priceEurE8: toE8(100).toString(),
    day: '2026-10-30',
  },
  closes: [{ day: '2026-10-30', priceE8: toE8(100) }],
  perEurE8: toE8(1),
});

describe('plans', () => {
  it('reads RPlan: the weekday, a fortnight from the next one, the products and the shortfall', () => {
    // 2 Nov 2026 is a Monday.
    expect(nextWeekday('2026-11-02', 1)).toBe('2026-11-02');
    expect(nextWeekday('2026-11-03', 1)).toBe('2026-11-09');
    const weekly = readPlanForm(
      form([
        ['account', 'b'],
        ['frequency', 'semanal'],
        ['day', '1'],
        ['shortfall', 'no_comprar'],
        ['leg_id', 'sym:EUNL.DE'],
        ['leg_name', 'World'],
        ['leg_amount', '250'],
        ['leg_id', 'inst-1'],
        ['leg_name', 'Gold'],
        ['leg_amount', '29,50'],
      ]),
      '2026-11-03',
    );
    expect(weekly).toMatchObject({
      ok: true,
      input: {
        frequency: 'semanal',
        day: 1,
        startOn: '2026-11-03',
        shortfallAccountId: null,
        legs: [
          { symbol: 'EUNL.DE', amountCents: 25_000 },
          { instrumentId: 'inst-1', amountCents: 2_950 },
        ],
      },
    });
    expect(
      readPlanForm(
        form([
          ['account', 'b'],
          ['frequency', 'quincenal'],
          ['day', '1'],
          ['shortfall', 'otra_cuenta'],
          ['shortfall_account', 'k'],
          ['leg_id', 'inst-1'],
          ['leg_amount', '40'],
        ]),
        '2026-11-03',
      ),
    ).toMatchObject({
      ok: true,
      input: {
        day: null,
        startOn: '2026-11-09',
        shortfall: 'otra_cuenta',
        shortfallAccountId: 'k',
      },
    });
    const bad = readPlanForm(
      form([
        ['frequency', 'mensual'],
        ['day', '32'],
        ['shortfall', 'otra_cuenta'],
      ]),
      '2026-11-03',
    );
    expect(bad.ok ? {} : bad.errors).toEqual({
      day: 'Elige el día',
      shortfall: 'Elige de qué cuenta',
      legs: 'Añade al menos un producto',
    });
  });

  it('saves its products, a picked listing as a shared instrument, and replaces them on change', async () => {
    const input = {
      accountId: broker,
      frequency: 'semanal' as const,
      day: 1,
      startOn: '2026-11-02',
      shortfall: 'otra_cuenta' as const,
      shortfallAccountId: bank,
      legs: [{ symbol: 'EUNL.DE', amountCents: 25_000 }],
    };
    const asked: string[] = [];
    const priced = async (s: string) => (asked.push(s), quoteOf(s, 'iShares Core MSCI World'));
    const id = (await savePlan(db, 'ana', null, input, priced)) as string;
    const legs = await planLegs(db, id);
    expect(legs).toEqual([
      {
        instrumentId: expect.any(String),
        name: 'iShares Core MSCI World',
        isin: 'IE00B4L5Y983',
        cents: 25_000,
      },
    ]);
    expect(
      await db.query(`select name, from_account_id, shortfall from auto_rule where id = $1`, [id]),
    ).toEqual([
      { name: 'Plan en Trade Republic', from_account_id: broker, shortfall: 'otra_cuenta' },
    ]);
    // Changing it: the same product by its instrument and another one; nothing asked twice.
    const changed = await savePlan(
      db,
      'ana',
      id,
      {
        ...input,
        legs: [
          { instrumentId: legs[0]!.instrumentId, amountCents: 30_000 },
          { symbol: 'SGLN.L', amountCents: 2_900 },
        ],
      },
      async (s) => quoteOf(s, 'Physical Gold'),
    );
    expect(changed).toBe(id);
    expect((await planLegs(db, id)).map((l) => [l.name, l.cents])).toEqual([
      ['iShares Core MSCI World', 30_000],
      ['Physical Gold', 2_900],
    ]);
    expect(asked).toEqual(['EUNL.DE']);
    expect(await savePlan(db, 'ana', null, input, async () => null)).toBe('sin_precio');
  });

  it('refuses another’s account, another’s private product and a rule that is not a plan', async () => {
    const input = {
      accountId: broker,
      frequency: 'mensual' as const,
      day: 2,
      startOn: '2026-11-02',
      shortfall: 'no_comprar' as const,
      shortfallAccountId: null,
      legs: [{ symbol: 'X', amountCents: 100 }],
    };
    const priced = async (s: string) => quoteOf(s, 'X');
    expect(await savePlan(db, 'ana', null, { ...input, accountId: hers }, priced)).toBeNull();
    expect(await savePlan(db, 'ana', null, { ...input, accountId: bank }, priced)).toBeNull();
    expect(
      await savePlan(
        db,
        'ana',
        null,
        { ...input, shortfall: 'otra_cuenta', shortfallAccountId: hers },
        priced,
      ),
    ).toBeNull();
    const [{ id: own }] = await db.query<{ id: string }>(
      `insert into instrument (kind, name, currency, owner_user_id) values ('estimado', 'De Eva', 'EUR', 'eva') returning id`,
    );
    expect(
      await savePlan(
        db,
        'ana',
        null,
        { ...input, legs: [{ instrumentId: own, amountCents: 100 }] },
        priced,
      ),
    ).toBeNull();
    const transfer = (await saveAutoRule(db, 'ana', null, {
      name: 'Al bróker',
      kind: 'transferencia',
      frequency: 'mensual',
      day: 1,
      startOn: '2026-11-02',
      endOn: null,
      fromAccountId: bank,
      toAccountId: broker,
      amountCents: 150_000,
    }))!;
    expect(await savePlan(db, 'ana', transfer, input, priced)).toBeNull();
    // What comes in a month: the transfer.
    expect(await planContext(db, 'ana', broker)).toMatchObject({
      account: { name: 'Trade Republic', cash: 20_000 },
      monthlyIn: 150_000,
      others: [{ id: bank }],
    });
    expect(await planContext(db, 'eva', broker)).toBeNull();
  });
});
