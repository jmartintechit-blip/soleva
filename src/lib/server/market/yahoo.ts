import { type Fetch, type PriceProvider, type Series, fetchRetry, floatE8 } from './provider.ts';

// Yahoo Finance's public chart endpoint. No licence (Juan's decision, risk accepted): its name is
// never shown in the app, and every price it fails to give falls back to the user's own.
const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const HEADERS = { 'user-agent': 'Mozilla/5.0', accept: 'application/json' };

interface Chart {
  chart?: {
    result?: {
      meta: { currency: string; exchangeTimezoneName: string };
      timestamp?: number[];
      indicators: { quote: { close: (number | null)[] }[] };
    }[];
    error?: { description?: string } | null;
  };
}

export function yahoo(f: Fetch = fetch): PriceProvider {
  return {
    name: 'yahoo',
    async closes(symbol) {
      const res = await fetchRetry(
        f,
        `${BASE}${encodeURIComponent(symbol)}?range=1mo&interval=1d`,
        {
          headers: HEADERS,
        },
      );
      if (!res.ok) throw new Error(`yahoo ${symbol}: ${res.status}`);
      return parseChart((await res.json()) as Chart, symbol);
    },
  };
}

// Each bar's day in the exchange's own time zone; London quotes some listings in pence (GBp).
export function parseChart(body: Chart, symbol: string): Series {
  const r = body.chart?.result?.[0];
  if (!r) throw new Error(`yahoo ${symbol}: ${body.chart?.error?.description ?? 'no data'}`);
  const pence = r.meta.currency === 'GBp';
  const day = (t: number) =>
    new Date(t * 1000).toLocaleDateString('sv-SE', { timeZone: r.meta.exchangeTimezoneName });
  const closes = (r.timestamp ?? []).flatMap((t, i) => {
    const c = r.indicators.quote[0]?.close[i];
    return c == null || !(c > 0) ? [] : [{ day: day(t), priceE8: floatE8(pence ? c / 100 : c, 7) }];
  });
  return { currency: pence ? 'GBP' : r.meta.currency, closes };
}
