import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toE8 } from '#lib/engine/units.ts';
import type { Db } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { createPgliteDb } from './db/pglite.ts';
import { addProduct, quote } from './product.ts';

let db: Db;
let brk: string;
beforeEach(async () => {
  db = createPgliteDb();
  await migrate(db);
  for (const id of ['ana', 'eva'])
    await db.query(
      `insert into "user" (id, name, email, "emailVerified") values ($1, '', $2, true)`,
      [id, `${id}@x.es`],
    );
  [{ id: brk }] = await db.query<{ id: string }>(
    `insert into money_account (user_id, name, kind, balance_cents) values ('ana', 'Bróker', 'broker', 0) returning id`,
  );
  await db.query(`insert into fx_rate values ('USD', '2026-10-29', 108500000)`);
});
afterEach(() => db.close());

// The provider: a search that finds both listings, and 28 October's close.
const provider = (currency: string) => async (url: string | URL | Request) =>
  String(url).includes('/search')
    ? Response.json({
        quotes: [
          { symbol: 'IWDA.AS', exchange: 'AMS', quoteType: 'ETF', longname: 'iShares World' },
          { symbol: 'TTWO', exchange: 'NAS', quoteType: 'EQUITY', longname: 'Take-Two' },
        ],
      })
    : Response.json({
        chart: {
          result: [
            {
              meta: { currency, exchangeTimezoneName: 'Europe/Amsterdam' },
              timestamp: [1793145600],
              indicators: { quote: [{ close: [111.08] }] },
            },
          ],
        },
      });

describe('añadir producto', () => {
  it('prices a result in euros, at the ECB rate when it is listed in another currency', async () => {
    expect((await quote(db, 'IWDA.AS', '2026-10-30', provider('EUR')))?.quote).toEqual({
      symbol: 'IWDA.AS',
      exchange: 'AMS',
      name: 'iShares World',
      kind: 'etf',
      currency: 'EUR',
      priceEurE8: toE8('111.08').toString(),
      day: '2026-10-28',
    });
    // 111,08 $ at 1,085 $ per euro.
    expect((await quote(db, 'TTWO', '2026-10-30', provider('USD')))?.quote.priceEurE8).toBe(
      '10237788018',
    );
    expect(await quote(db, 'NOPE', '2026-10-30', provider('EUR'))).toBeNull();
  });

  it('adds what the user holds at its average price, leaving the cash as it was', async () => {
    const id = await addProduct(
      db,
      'ana',
      brk,
      '2026-10-30',
      { symbol: 'IWDA.AS', qtyE8: toE8('114.8'), avgEurE8: toE8('97.32') },
      provider('EUR'),
    );
    expect(
      await db.query(
        `select kind, amount_cents::float8 as a, qty_e8::text as q, price_e8::text as p, note
         from movement`,
      ),
    ).toEqual([{ kind: 'ajuste', a: 0, q: '11480000000', p: '9732000000', note: 'producto' }]);
    expect(
      await db.query(`select name, currency, source_id from instrument where id = $1`, [id]),
    ).toEqual([{ name: 'iShares World', currency: 'EUR', source_id: 'IWDA.AS' }]);
    expect(await db.query(`select day::text as d from price`)).toEqual([{ d: '2026-10-28' }]);
    // Again, by someone else's account, or without a price: nothing.
    const input = { symbol: 'IWDA.AS', qtyE8: 1n, avgEurE8: 1n };
    expect(await addProduct(db, 'eva', brk, '2026-10-30', input, provider('EUR'))).toBeNull();
    expect(
      await addProduct(db, 'ana', brk, '2026-10-30', { ...input, symbol: 'NOPE' }, provider('EUR')),
    ).toBe('sin_precio');
  });
});
