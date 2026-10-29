import { type Fetch, type PriceProvider, fetchRetry, floatE8 } from './provider.ts';

// The licensed alternative for stocks and ETFs (Marketstack Basic, ~9,99 $/month, "Commercial
// Use"). Off until MARKETSTACK_API_KEY is set and STOCK_PRICES=marketstack: paying for it is
// Juan's decision (a spending stop).
export function marketstack(apiKey: string, f: Fetch = fetch): PriceProvider {
  return {
    name: 'marketstack',
    async closes(symbol) {
      const url = `https://api.marketstack.com/v2/eod?access_key=${encodeURIComponent(apiKey)}&symbols=${encodeURIComponent(symbol)}&limit=30`;
      const res = await fetchRetry(f, url);
      if (!res.ok) throw new Error(`marketstack ${symbol}: ${res.status}`);
      const body = (await res.json()) as {
        data?: { date: string; close: number; price_currency?: string }[];
      };
      const rows = body.data ?? [];
      return {
        currency: rows[0]?.price_currency?.toUpperCase() ?? 'USD',
        closes: rows
          .filter((r) => r.close > 0)
          .map((r) => ({ day: r.date.slice(0, 10), priceE8: floatE8(r.close) }))
          .reverse(),
      };
    },
  };
}
