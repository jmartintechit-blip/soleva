import { describe, expect, it } from 'vitest';
import { addMonths, daysInMonth, monthsBetween, occursIn, ruleDay } from './dates.ts';

describe('months', () => {
  it('adds and subtracts across years', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
    expect(addMonths('2026-10', 240)).toBe('2046-10');
    expect(monthsBetween('2026-10', '2027-01')).toBe(3);
  });

  it('knows months of 28, 29, 30 and 31 days', () => {
    expect(daysInMonth('2027-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2100-02')).toBe(28);
    expect(daysInMonth('2026-04')).toBe(30);
    expect(daysInMonth('2026-12')).toBe(31);
  });

  it('moves day 31 and 29 to the last day of shorter months', () => {
    expect(ruleDay(31, '2027-02')).toBe(28);
    expect(ruleDay(31, '2028-02')).toBe(29);
    expect(ruleDay(29, '2027-02')).toBe(28);
    expect(ruleDay(31, '2026-04')).toBe(30);
    expect(ruleDay(31, '2026-12')).toBe(31);
    expect(ruleDay(15, '2027-02')).toBe(15);
  });
});

describe('occursIn', () => {
  const start = '2026-11';

  it('runs monthly from its start, not before', () => {
    const r = { frequency: 'mensual' as const, startMonth: start };
    expect(occursIn(r, '2026-10')).toBe(false);
    expect(occursIn(r, '2026-11')).toBe(true);
    expect(occursIn(r, '2030-07')).toBe(true);
  });

  it('runs every 3 or 12 months', () => {
    const q = { frequency: 'trimestral' as const, startMonth: start };
    expect(['2026-11', '2026-12', '2027-01', '2027-02'].map((m) => occursIn(q, m))).toEqual([
      true,
      false,
      false,
      true,
    ]);
    const y = { frequency: 'anual' as const, startMonth: start };
    expect(occursIn(y, '2027-11')).toBe(true);
    expect(occursIn(y, '2027-10')).toBe(false);
  });

  it('runs once only in its start month', () => {
    const o = { frequency: 'una_vez' as const, startMonth: start };
    expect(occursIn(o, '2026-11')).toBe(true);
    expect(occursIn(o, '2026-12')).toBe(false);
  });

  it('stops after its end month, which is included', () => {
    const r = { frequency: 'mensual' as const, startMonth: start, endMonth: '2027-03' };
    expect(occursIn(r, '2027-03')).toBe(true);
    expect(occursIn(r, '2027-04')).toBe(false);
  });
});
