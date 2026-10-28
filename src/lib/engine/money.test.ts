import { describe, expect, it } from 'vitest';
import { formatEuros, roundHalfAwayFromZero } from './money.ts';

describe('money', () => {
  it('rounds half away from zero', () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(-2.4)).toBe(-2);
  });

  it('formats whole euros the Spanish way, grouping 4 digits too', () => {
    expect(formatEuros(1_240_000)).toBe('12.400 €');
    expect(formatEuros(123_400)).toBe('1.234 €');
    expect(formatEuros(0)).toBe('0 €');
    expect(formatEuros(150)).toBe('2 €');
    expect(formatEuros(-300)).toBe('−3 €');
  });

  it('formats cents when asked', () => {
    expect(formatEuros(125_050, { withCents: true })).toBe('1.250,50 €');
    expect(formatEuros(-5, { withCents: true })).toBe('−0,05 €');
  });
});
