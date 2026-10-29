import { describe, expect, it } from 'vitest';
import { toE8 } from '#lib/engine/units.ts';
import { parseEcb } from './ecb.ts';
import { marketstack } from './marketstack.ts';
import { mobula } from './mobula.ts';
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

describe('ecb, mobula and marketstack', () => {
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

  it('sends the Mobula key and reads the price in dollars', async () => {
    let auth = '';
    const p = mobula('k', async (_url, init) => {
      auth = new Headers(init?.headers).get('authorization')!;
      return Response.json({ data: { price: 3612.123456789 } });
    });
    const s = await p.closes('ethereum');
    expect(auth).toBe('k');
    expect(s.currency).toBe('USD');
    expect(s.closes[0]!.priceE8).toBe(toE8('3612.123457'));
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
