import { describe, expect, it } from 'vitest';
import { addDays, dayIn, daysAfter, daysBetween, daysInYear, madridToday, weekday } from './day.ts';
import { E8, divRound, parseUnits, toE8, unitsFor, unitsText, valueCents } from './units.ts';

describe('days', () => {
  it('counts across months, leap years and the change of time', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    // The night the clocks go back in Madrid is still one day.
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
    expect(daysInYear('2028-06-01')).toBe(366);
    expect(weekday('2026-11-02')).toBe(1);
    expect(weekday('2026-11-08')).toBe(7);
    expect(dayIn('2026-02', 31)).toBe('2026-02-28');
    expect([...daysAfter('2026-10-30', '2026-11-01')]).toEqual(['2026-10-31', '2026-11-01']);
  });

  it('takes today in Madrid, not in UTC', () => {
    // 23:30 UTC on 31 December is already 1 January in Madrid.
    expect(madridToday(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(madridToday(new Date('2026-07-01T21:59:00Z'))).toBe('2026-07-01');
  });
});

describe('units', () => {
  it('rounds half away from zero', () => {
    expect([divRound(5n, 2n), divRound(-5n, 2n), divRound(4n, 3n), divRound(-4n, 3n)]).toEqual([
      3n,
      -3n,
      1n,
      -1n,
    ]);
  });

  it('values units in euro cents, with the ECB rate for other currencies', () => {
    expect(valueCents(toE8('0.5'), toE8('100.5'))).toBe(5025);
    // 10 units at 108.50 USD with 1.085 USD per euro are 1.000 €.
    expect(valueCents(toE8(10), toE8('108.50'), toE8('1.085'))).toBe(100_000);
    // ETH: 0.12345678 at 3.210,99 €.
    expect(valueCents(toE8('0.12345678'), toE8('3210.99'))).toBe(39_642);
    expect(valueCents(toE8('-2'), toE8('1.005'))).toBe(-201);
  });

  it('buys whole cents worth of units, rounded down to 8 decimals', () => {
    // 50 € at 108,50 USD with 1,085 USD per euro: 0.5 units exactly.
    expect(unitsFor(5000, toE8('108.50'), toE8('1.085'))).toBe(toE8('0.5'));
    const q = unitsFor(2500, toE8('3210.99'));
    expect(q).toBe(toE8('0.00778576'));
    expect(valueCents(q, toE8('3210.99'))).toBeLessThanOrEqual(2500);
    expect(toE8('12.5')).toBe(12n * E8 + E8 / 2n);
    expect(toE8(-0.25)).toBe(-(E8 / 4n));
  });
});

describe('units typed by the user', () => {
  it('reads them the Spanish way, up to 8 decimals, and writes them back', () => {
    expect(parseUnits('114,7987')).toBe(11_479_870_000n);
    expect(parseUnits('1.250,5')).toBe(125_050_000_000n);
    expect(parseUnits('0.91040000')).toBe(91_040_000n);
    expect(parseUnits('0')).toBe(0n);
    for (const bad of ['', '-1', '1,123456789', 'abc']) expect(parseUnits(bad)).toBeNull();
    expect(unitsText(11_479_870_000n)).toBe('114,7987');
    expect(unitsText(-130_000n)).toBe('−0,0013');
    expect(unitsText(300_000_000n)).toBe('3');
    // At most 6 decimals, rounded.
    expect(unitsText(25_431_234n)).toBe('0,254312');
    expect(unitsText(1_127_895_615n)).toBe('11,278956');
    expect(unitsText(-49n)).toBe('0');
  });
});
