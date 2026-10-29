import { describe, expect, it } from 'vitest';
import { type DayRow, period, periodStart } from './home.ts';

const row = (day: string, total: number, flows: number, accounts: DayRow['accounts']): DayRow => ({
  day,
  total,
  flows,
  accounts,
});

// Opened on 1 Oct with 10.000 € (a flow), 1.000 € moved to the broker on 1 Nov (not a flow of the
// total, a flow of each account), 300 € of salary on 2 Nov, and the broker's units up 50 €.
const rows = [
  row('2026-10-01', 1_000_000, 1_000_000, { bank: [1_000_000, 1_000_000] }),
  row('2026-10-31', 1_000_000, 0, { bank: [1_000_000, 0] }),
  row('2026-11-01', 1_000_000, 0, { bank: [900_000, -100_000], brk: [100_000, 100_000] }),
  row('2026-11-02', 1_035_000, 30_000, { bank: [930_000, 30_000], brk: [105_000, 0] }),
];

describe('home periods', () => {
  it('starts each period where Inicio says', () => {
    expect(periodStart('dia', '2026-11-02', '2026-10-01')).toBe('2026-11-01');
    expect(periodStart('mes', '2026-11-02', '2026-10-01')).toBe('2026-10-31');
    expect(periodStart('m3', '2026-05-31', '2026-01-01')).toBe('2026-02-28');
    expect(periodStart('ano', '2026-11-02', '2026-10-01')).toBe('2025-11-02');
    expect(periodStart('todo', '2026-11-02', '2026-10-01')).toBe('2026-09-30');
  });

  it('separates what you put in from what your money made, per account too', () => {
    const month = period(rows, 'mes', '2026-11-02');
    expect(month).toMatchObject({ value: 1_035_000, change: 35_000, put: 30_000, made: 5_000 });
    // The transfer is a flow of each account: the bank made nothing, the broker made 50 €.
    expect(month.accounts).toEqual({ bank: 0, brk: 5_000 });
    expect(month.series).toEqual([1_000_000, 1_000_000, 1_035_000]);
    const all = period(rows, 'todo', '2026-11-02');
    expect(all).toMatchObject({ put: 1_030_000, made: 5_000 });
    expect(all.rate).toBeGreaterThan(0);
  });
});
