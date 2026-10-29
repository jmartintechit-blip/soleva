import { type Month } from './dates.ts';
import { type Day, dayIn, monthOf } from './day.ts';
import { divRound } from './units.ts';

export interface InterestTerms {
  // Marginal: each rate on the part of the balance up to its limit; the last one has none.
  tiers: { upToCents?: number; rateBp: number }[];
  baseDays: 360 | 365;
  payFrequency: 'mensual' | 'trimestral' | 'semestral' | 'anual';
  payDay: number;
  // After this day the whole balance earns afterRateBp.
  promoUntil?: Day;
  afterRateBp?: number;
  withholdingBp: number;
}

// Interest is accrued in millionths of a cent, so a year of days adds up without a float.
export const MICRO = 1_000_000n;

// One day's interest on that day's closing balance (nothing on a negative one).
export function dailyAccrual(balanceCents: number, t: InterestTerms, day: Day): bigint {
  if (balanceCents <= 0) return 0n;
  const base = BigInt(t.baseDays) * 10_000n;
  if (t.promoUntil && day > t.promoUntil)
    return (BigInt(balanceCents) * BigInt(t.afterRateBp ?? 0) * MICRO) / base;
  let accrued = 0n;
  let below = 0;
  for (const { upToCents, rateBp } of t.tiers) {
    const top = upToCents === undefined ? balanceCents : Math.min(balanceCents, upToCents);
    if (top > below) accrued += (BigInt(top - below) * BigInt(rateBp) * MICRO) / base;
    below = Math.max(below, top);
    if (below >= balanceCents) break;
  }
  return accrued;
}

const EVERY = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 } as const;

// Paid on its day in the last month of each period of the calendar year (Mar, Jun, Sep, Dec for
// quarterly).
export function isPayDay(t: InterestTerms, day: Day): boolean {
  const m: Month = monthOf(day);
  return Number(m.slice(5, 7)) % EVERY[t.payFrequency] === 0 && dayIn(m, t.payDay) === day;
}

// What a payment of `accrued` gives: whole cents, the part withheld (19 % by default) and the net.
export function payment(accrued: bigint, t: InterestTerms) {
  const gross = Number(accrued / MICRO);
  const withheld = Number(divRound(BigInt(gross) * BigInt(t.withholdingBp), 10_000n));
  return { gross, withheld, net: gross - withheld };
}
