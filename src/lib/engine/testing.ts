import type { Market } from './advance.ts';
import { type Day, addDays } from './day.ts';
import { toE8 } from './units.ts';

// Prices on weekdays only, like a real market: each instrument at a fixed price per day.
export function market(
  prices: Record<string, { currency: string; price: string; from?: Day }>,
  usdPerEur = '1.085',
): Market {
  return {
    currency: (id) => prices[id]!.currency,
    perEur: (c) => (c === 'USD' ? toE8(usdPerEur) : undefined),
    close: (id, day) => {
      const p = prices[id]!;
      let d = day;
      while (new Date(`${d}T12:00:00Z`).getUTCDay() % 6 === 0) d = addDays(d, -1);
      return p.from && d < p.from ? undefined : { day: d, priceE8: toE8(p.price) };
    },
  };
}
