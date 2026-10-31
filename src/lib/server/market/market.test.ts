import { describe, expect, it } from 'vitest';
import { toE8 } from '#lib/engine/units.ts';
import { migrate } from '../db/migrate.ts';
import { createPgliteDb } from '../db/pglite.ts';
import { parseEcb } from './ecb.ts';
import { marketstack } from './marketstack.ts';
import { fetchRetry } from './provider.ts';
import { parseChart, yahoo } from './yahoo.ts';

const chart = (currency: string, tz: string, timestamps: number[], closes: (number | null)[]) => ({
  chart: {
    result: [
      {
        meta: { currency, exchangeTimezoneName: tz },
        timestamp: timestamps,
        indicators: { quote: [{ close: closes }] },
      },
    ],
  },
});

describe('yahoo', () => {
  it('reads each close on its exchange’s own day, skips gaps and turns pence into pounds', () => {
    // 1793059200 is 2026-10-27 00:00 UTC: still the 26th in New York.
    expect(
      parseChart(chart('USD', 'America/New_York', [1793059200, 1793174400], [230.1, null]), 'TTWO'),
    ).toEqual({
      currency: 'USD',
      closes: [{ day: '2026-10-26', priceE8: toE8('230.1') }],
    });
    expect(parseChart(chart('GBp', 'Europe/London', [1793091600], [7834.5]), 'X')).toEqual({
      currency: 'GBP',
      closes: [{ day: '2026-10-27', priceE8: toE8('78.345') }],
    });
    expect(
      parseChart(chart('EUR', 'Europe/Amsterdam', [1793091600], [131.50999450683594]), 'IWDA.AS')
        .closes[0]!.priceE8,
    ).toBe(toE8('131.51'));
    expect(() =>
      parseChart({ chart: { result: [], error: { description: 'No data found' } } }, 'NOPE'),
    ).toThrow(/No data/);
  });

  it('asks for a month of daily bars and fails loudly on errors', async () => {
    const urls: string[] = [];
    const ok = yahoo(async (url) => {
      urls.push(String(url));
      return Response.json(chart('EUR', 'Europe/Madrid', [1793091600], [8.4]));
    });
    expect((await ok.closes('SAN.MC')).closes).toHaveLength(1);
    expect(urls[0]).toBe(
      'https://query1.finance.yahoo.com/v8/finance/chart/SAN.MC?range=1mo&interval=1d',
    );
    await expect(yahoo(async () => new Response('', { status: 404 })).closes('X')).rejects.toThrow(
      /404/,
    );
  });
});

describe('fetchRetry', () => {
  it('retries 429, 5xx and network errors with growing waits, and nothing else', async () => {
    const waits: number[] = [];
    const wait = async (ms: number) => void waits.push(ms);
    let calls = 0;
    const flaky = async () => {
      calls++;
      if (calls === 1) throw new Error('reset');
      return new Response('', { status: calls === 2 ? 429 : 200 });
    };
    expect((await fetchRetry(flaky, 'u', {}, 3, wait)).status).toBe(200);
    expect(waits).toEqual([500, 1000]);
    calls = 0;
    const notFound = async () => (calls++, new Response('', { status: 404 }));
    expect((await fetchRetry(notFound, 'u', {}, 3, wait)).status).toBe(404);
    expect(calls).toBe(1);
  });
});

describe('ecb and marketstack', () => {
  it('reads the ECB rates as units per euro', () => {
    const csv = `KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE
EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10-29,1.113
EXR.D.GBP.EUR.SP00.A,D,GBP,EUR,SP00,A,2026-10-29,0.83578
EXR.D.RUB.EUR.SP00.A,D,RUB,EUR,SP00,A,2026-10-29,NaN`;
    expect(parseEcb(csv)).toEqual([
      { currency: 'USD', day: '2026-10-29', perEurE8: toE8('1.113') },
      { currency: 'GBP', day: '2026-10-29', perEurE8: toE8('0.83578') },
    ]);
  });

  it('reads Marketstack end-of-day bars oldest first', async () => {
    const p = marketstack('k', async () =>
      Response.json({
        data: [
          { date: '2026-10-29T00:00:00+0000', close: 131.5, price_currency: 'eur' },
          { date: '2026-10-28T00:00:00+0000', close: 131.7 },
        ],
      }),
    );
    expect(await p.closes('IWDA.XAMS')).toEqual({
      currency: 'EUR',
      closes: [
        { day: '2026-10-28', priceE8: toE8('131.7') },
        { day: '2026-10-29', priceE8: toE8('131.5') },
      ],
    });
  });
});

describe('bde', () => {
  it('reads the official monthly Euribor to a tenth of a basis point, negatives too', async () => {
    const { parseBde } = await import('./bde.ts');
    expect(
      parseBde([
        {
          fechas: ['2026-09-01T08:15:00Z', '2021-11-01T09:15:00Z', '2020-01-01T09:15:00Z'],
          valores: [3.247, -0.487, null],
        },
      ]),
    ).toEqual([
      { month: '2026-09-01', rateBp: 324.7 },
      { month: '2021-11-01', rateBp: -48.7 },
    ]);
    expect(() => parseBde({ errNum: 412 })).toThrow();
  });
});

describe('searchInstruments', () => {
  it('keeps the search order, maps kinds, spots ETCs and drops what we cannot hold', async () => {
    const { searchInstruments } = await import('./search.ts');
    let asked = '';
    const f = async (url: string | URL | Request) => {
      asked = String(url);
      return Response.json({
        quotes: [
          {
            symbol: 'IWDA.AS',
            exchange: 'AMS',
            quoteType: 'ETF',
            longname: 'iShares Core MSCI World UCITS ETF USD (Acc)',
          },
          {
            symbol: 'IGLN.L',
            exchange: 'LSE',
            quoteType: 'EQUITY',
            longname: 'iShares Physical Gold ETC',
          },
          {
            symbol: 'TTWO',
            exchange: 'NAS',
            quoteType: 'EQUITY',
            longname: 'Take-Two Interactive Software, Inc.',
          },
          { symbol: '^GSPC', exchange: 'SNP', quoteType: 'INDEX', shortname: 'S&P 500' },
          { symbol: 'X', quoteType: 'ETF' },
        ],
      });
    };
    expect((await searchInstruments(' IE00B4L5Y983 ', f)).map((c) => [c.symbol, c.kind])).toEqual([
      ['IWDA.AS', 'etf'],
      ['IGLN.L', 'etc'],
      ['TTWO', 'accion'],
    ]);
    expect(asked).toContain('q=IE00B4L5Y983&');
    expect(await searchInstruments('a', f)).toEqual([]);
  });
});

describe('searchProducts', () => {
  const listing = (symbol: string, exchange: string, exchDisp: string, longname: string) => ({
    symbol,
    exchange,
    exchDisp,
    quoteType: 'ETF',
    longname,
  });
  const WORLD = 'iShares Core MSCI World UCITS ETF USD (Acc)';
  const f = async (url: string | URL | Request) => {
    const u = decodeURIComponent(String(url));
    if (u.includes('registers.esma'))
      return Response.json({
        response: {
          docs: [
            { isin: 'IE00B4L5Y983', gnr_full_name: WORLD },
            { isin: 'IE00B4L5Y983', gnr_full_name: WORLD },
            { isin: 'IE000OTHER01', gnr_full_name: `${WORLD} EUR Hedged` },
          ],
        },
      });
    if (u.includes('q=IE00B4L5Y983'))
      return Response.json({ quotes: [listing('IWDA.L', 'LSE', 'London', WORLD)] });
    return Response.json({
      quotes: [
        listing('IWDA.L', 'LSE', 'London', WORLD),
        listing('URTH', 'PCX', 'NYSEArca', 'iShares MSCI World ETF'),
        listing('IWDA.AS', 'AMS', 'Amsterdam', WORLD),
        listing('EUNL.DE', 'GER', 'XETRA', WORLD),
      ],
    });
  };

  it('shows each product once, the euro listing first, and its ISIN after, from then on cached', async () => {
    const { missingIsins, searchProducts } = await import('./search.ts');
    const db = createPgliteDb();
    await migrate(db);
    let firds = 0;
    const counted = (url: string | URL | Request) => {
      if (String(url).includes('registers.esma')) firds++;
      return f(url);
    };
    const found = await searchProducts(db, 'msci world', counted);
    expect(found.map((p) => [p.name, p.isin, p.listings.map((l) => l.symbol)])).toEqual([
      [WORLD, null, ['EUNL.DE', 'IWDA.AS', 'IWDA.L']],
      ['iShares MSCI World ETF', null, ['URTH']],
    ]);
    expect(firds).toBe(0);
    expect(await missingIsins(db, found, counted)).toEqual({ [WORLD]: 'IE00B4L5Y983' });
    expect(firds).toBe(2);
    // Next time the found one comes with the results; only the one FIRDS does not know is asked.
    const again = await searchProducts(db, 'msci world', counted);
    expect(again.map((p) => p.isin)).toEqual(['IE00B4L5Y983', null]);
    expect(await missingIsins(db, again, counted)).toEqual({});
    expect(firds).toBe(3);
    await db.close();
  });

  it('finds the other listings of a typed ISIN, and an ISIN no name leads to is not shown', async () => {
    const { isinOf, searchProducts } = await import('./search.ts');
    const db = createPgliteDb();
    await migrate(db);
    const found = await searchProducts(db, ' ie00b4l5y983 ', f);
    expect(found.map((p) => [p.isin, p.listings.map((l) => l.market)])).toEqual([
      ['IE00B4L5Y983', ['XETRA', 'Amsterdam', 'London']],
    ]);
    expect(await isinOf('Nothing like it', f)).toBeNull();
    expect(await isinOf(WORLD, async () => new Response('', { status: 500 }))).toBeNull();
    await db.close();
  });
});
