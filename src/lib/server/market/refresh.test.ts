import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toE8 } from '#lib/engine/units.ts';
import type { Db } from '../db/index.ts';
import { migrate } from '../db/migrate.ts';
import { createPgliteDb } from '../db/pglite.ts';
import type { PriceProvider } from './provider.ts';
import { lastClosedDay, refreshPrices, refreshRates } from './refresh.ts';

let db: Db;
let ids: Record<string, string>;
beforeEach(async () => {
  db = createPgliteDb();
  await migrate(db);
  await db.query(
    `insert into "user" (id, name, email, "emailVerified") values ('ana', '', 'a@x.es', true)`,
  );
  const [{ id: brk }] = await db.query<{ id: string }>(
    `insert into money_account (user_id, name, kind, balance_cents) values ('ana', 'B', 'broker', 0) returning id`,
  );
  ids = {};
  for (const [k, kind, source, symbol] of [
    ['world', 'etf', 'yahoo', 'IWDA.AS'],
    ['eth', 'cripto', 'yahoo', 'ETH-EUR'],
    ['idle', 'etf', 'yahoo', 'IDLE.AS'],
    ['broken', 'accion', 'yahoo', 'BROKEN'],
  ] as const) {
    const [{ id }] = await db.query<{ id: string }>(
      `insert into instrument (kind, name, currency, price_source, source_id)
       values ($1, $2, 'EUR', $3, $4) returning id`,
      [kind, k, source, symbol],
    );
    ids[k] = id;
  }
  for (const k of ['world', 'eth', 'broken'])
    await db.query(`insert into position values ($1, $2, 100000000, 100)`, [brk, ids[k]]);
});
afterEach(() => db.close());

const fake = (name: PriceProvider['name'], asked: string[]): PriceProvider => ({
  name,
  async closes(symbol) {
    asked.push(symbol);
    if (symbol === 'BROKEN') throw new Error('429');
    return {
      currency: 'EUR',
      // Crypto trades on weekends too.
      closes: (symbol === 'ETH-EUR'
        ? ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09']
        : ['2026-11-05', '2026-11-06', '2026-11-09']
      ).map((day) => ({
        day,
        priceE8: toE8('131.51'),
      })),
    };
  },
});

describe('refreshPrices', () => {
  it('asks only for what is held, stores finished days, and skips what is up to date', async () => {
    expect(lastClosedDay('2026-11-09')).toBe('2026-11-06');
    expect(lastClosedDay('2026-11-09', true)).toBe('2026-11-08');
    const asked: string[] = [];
    const deps = { providers: { yahoo: fake('yahoo', asked) } };
    const first = await refreshPrices(db, deps, '2026-11-09');
    // Monday's own bar is final for neither: the stock up to Friday, the crypto up to Sunday.
    expect(first).toEqual({ stored: 6, failed: [ids.broken], more: false });
    expect(asked.sort()).toEqual(['BROKEN', 'ETH-EUR', 'IWDA.AS']);
    asked.length = 0;
    await refreshPrices(db, deps, '2026-11-09');
    expect(asked).toEqual(['BROKEN']);
    // Batches: one per call, and it says there is more.
    expect((await refreshPrices(db, deps, '2026-11-10', 0)).more).toBe(true);
  });

  it('marks a provider that is off as failed instead of guessing', async () => {
    const r = await refreshPrices(db, { providers: {} }, '2026-11-09');
    expect(r.failed.sort()).toEqual([ids.world, ids.eth, ids.broken].sort());
  });
});

describe('refreshRates', () => {
  it('keeps ECB rates and the Euribor once each', async () => {
    const f = async (url: string | URL | Request) =>
      String(url).includes('ecb')
        ? new Response(
            'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE\nEXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10-29,1.113\n',
          )
        : Response.json([{ fechas: ['2026-09-01T08:15:00Z'], valores: [3.247] }]);
    expect(await refreshRates(db, f)).toEqual({ fx: 1, euribor: 1 });
    await refreshRates(db, f);
    expect(await db.query(`select per_eur_e8::text as v from fx_rate`)).toEqual([
      { v: '111300000' },
    ]);
    expect(await db.query(`select rate_bp::float8 as v from index_rate`)).toEqual([{ v: 324.7 }]);
  });
});
