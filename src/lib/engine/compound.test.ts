import { describe, expect, it } from 'vitest';
import { contributed, futureValue, scenarios } from './compound.ts';

describe('futureValue', () => {
  it('compounds a lump sum to the yearly rate after 12 months', () => {
    expect(futureValue({ startCents: 1_000_000, monthlyCents: 0, months: 12 }, 600, 0)).toBe(
      1_060_000,
    );
  });

  it('deflates: a return equal to inflation keeps the same euros of today', () => {
    const plan = { startCents: 1_000_000, monthlyCents: 30_000, months: 120 };
    expect(futureValue(plan, 250, 250)).toBe(contributed(plan));
  });

  it('matches adding each month by hand', () => {
    const plan = { startCents: 500_000, monthlyCents: 20_000, months: 36 };
    const i = ((1 + 0.06) / (1 + 0.025)) ** (1 / 12) - 1;
    let v = plan.startCents;
    for (let k = 0; k < plan.months; k++) v = v * (1 + i) + plan.monthlyCents;
    expect(futureValue(plan, 600)).toBe(Math.round(v));
  });

  it('loses value in euros of today when the return is below inflation', () => {
    expect(futureValue({ startCents: 1_000_000, monthlyCents: 0, months: 120 }, 0)).toBeLessThan(
      1_000_000,
    );
  });

  it('returns whole cents', () => {
    expect(Number.isInteger(futureValue({ startCents: 1, monthlyCents: 1, months: 7 }, 600))).toBe(
      true,
    );
  });
});

describe('scenarios', () => {
  it('orders prudente < base < optimista above what you put in', () => {
    const plan = { startCents: 1_000_000, monthlyCents: 30_000, months: 120 };
    const s = scenarios(plan);
    expect(contributed(plan)).toBeLessThan(s.prudente);
    expect(s.prudente).toBeLessThan(s.base);
    expect(s.base).toBeLessThan(s.optimista);
  });
});
