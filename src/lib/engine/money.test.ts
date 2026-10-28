import { describe, expect, it } from 'vitest';
import { formatEuros, parseEuros, parsePercent, roundHalfAwayFromZero } from './money.ts';

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

  it('reads amounts typed the Spanish way, or with a decimal point', () => {
    expect(parseEuros('1.250,50 €')).toBe(125_050);
    expect(parseEuros('1250,5')).toBe(125_050);
    expect(parseEuros('12.5')).toBe(1_250);
    expect(parseEuros('1.250')).toBe(125_000);
    expect(parseEuros('1.234.567')).toBe(123_456_700);
    expect(parseEuros(' 300 ')).toBe(30_000);
    expect(parseEuros('0,05')).toBe(5);
    for (const bad of ['', 'abc', '1,234', '1,2,3', ',5']) expect(parseEuros(bad)).toBeNull();
  });

  it('reads percentages as basis points, with their sign', () => {
    expect(parsePercent('6')).toBe(600);
    expect(parsePercent('6,5 %')).toBe(650);
    expect(parsePercent('−15')).toBe(-1500);
    expect(parsePercent('-0,25')).toBe(-25);
  });
});
