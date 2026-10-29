import type { Day } from '#lib/engine/day.ts';
import { toE8 } from '#lib/engine/units.ts';

// One daily close, in the listing's currency, ×10^8.
export interface Close {
  day: Day;
  priceE8: bigint;
}
export interface Series {
  currency: string;
  closes: Close[];
}

// Every price source looks the same to the rest of the app: swap Yahoo for Marketstack (or add
// one) and nothing else changes. `sourceId` is the symbol at that provider (IWDA.AS, ethereum…).
export interface PriceProvider {
  name: 'yahoo' | 'mobula' | 'marketstack';
  closes(sourceId: string): Promise<Series>;
}

export type Fetch = typeof fetch;

// Retries with growing waits (0,5 s, 1 s, 2 s) on network errors, 429 and 5xx; other answers are
// final. The caller falls back to the user's manual price when it still fails.
export async function fetchRetry(
  f: Fetch,
  url: string,
  init: RequestInit = {},
  tries = 3,
  wait = (ms: number) => new Promise((r) => setTimeout(r, ms)),
): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      const res = await f(url, init);
      if (res.ok || (res.status !== 429 && res.status < 500) || i === tries - 1) return res;
    } catch (error) {
      if (i === tries - 1) throw error;
    }
    await wait(500 * 2 ** i);
  }
}

// Provider floats carry noise (131.50999450683594 is 131.51 in single precision): rounded to
// `significant` digits, then to the 8 decimals we keep, so tiny crypto prices survive too.
export const floatE8 = (x: number, significant = 10) =>
  toE8(Number(x.toPrecision(significant)).toFixed(8));
