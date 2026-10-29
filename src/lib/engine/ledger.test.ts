import { describe, expect, it } from 'vitest';
import { type Movement, fold, holdingKey } from './ledger.ts';
import { occurrences, perMonth } from './schedule.ts';
import { toE8 } from './units.ts';

const mv = (m: Partial<Movement> & Pick<Movement, 'accountId' | 'day' | 'kind'>): Movement => ({
  seq: 0,
  amountCents: 0,
  source: 'manual',
  ...m,
});

describe('fold', () => {
  it('derives cash and holdings, skipping voided rows and the future', () => {
    const book = fold(
      [
        mv({ accountId: 'b', day: '2026-11-01', kind: 'apertura', amountCents: 100_000 }),
        mv({
          accountId: 'b',
          day: '2026-11-03',
          kind: 'compra',
          amountCents: -10_000,
          instrumentId: 'w',
          qtyE8: toE8(2),
          priceE8: toE8(50),
        }),
        mv({
          accountId: 'b',
          day: '2026-11-04',
          kind: 'compra',
          amountCents: -20_000,
          instrumentId: 'w',
          qtyE8: toE8(2),
          priceE8: toE8(100),
        }),
        mv({
          accountId: 'b',
          day: '2026-11-05',
          kind: 'venta',
          amountCents: 12_000,
          instrumentId: 'w',
          qtyE8: toE8(-1),
          priceE8: toE8(120),
        }),
        mv({ accountId: 'b', day: '2026-11-05', kind: 'gasto', amountCents: -999, voided: true }),
        mv({ accountId: 'b', day: '2026-12-01', kind: 'gasto', amountCents: -5 }),
      ],
      '2026-11-30',
    );
    expect(book.cash.get('b')).toBe(82_000);
    // Average cost: 30.000 for 4 units, one sold takes a quarter of it.
    expect(book.holdings.get(holdingKey('b', 'w'))).toEqual({ qtyE8: toE8(3), costCents: 22_500 });
  });

  it('multiplies units on a split and carries the cost of a fund switch', () => {
    const book = fold([
      mv({
        accountId: 'a',
        day: '2026-01-02',
        kind: 'compra',
        amountCents: -40_000,
        instrumentId: 'f',
        qtyE8: toE8(4),
        priceE8: toE8(100),
      }),
      mv({ accountId: 'a', day: '2026-02-02', kind: 'split', instrumentId: 'f', qtyE8: toE8(12) }),
      mv({
        accountId: 'a',
        day: '2026-03-02',
        seq: 0,
        kind: 'traspaso_valores',
        instrumentId: 'f',
        qtyE8: toE8(-8),
        transferId: 't',
      }),
      mv({
        accountId: 'c',
        day: '2026-03-02',
        seq: 1,
        kind: 'traspaso_valores',
        instrumentId: 'f',
        qtyE8: toE8(8),
        transferId: 't',
      }),
    ]);
    expect(book.holdings.get(holdingKey('a', 'f'))).toEqual({ qtyE8: toE8(8), costCents: 20_000 });
    expect(book.holdings.get(holdingKey('c', 'f'))).toEqual({ qtyE8: toE8(8), costCents: 20_000 });
    expect(book.cash.get('c')).toBe(0);
  });
});

describe('occurrences', () => {
  it('falls on its weekday every week, from its start and within its end', () => {
    expect(
      occurrences(
        { frequency: 'semanal', day: 1, startOn: '2026-11-04' },
        '2026-11-01',
        '2026-11-30',
      ),
    ).toEqual(['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
    expect(
      occurrences(
        { frequency: 'semanal', day: 1, startOn: '2026-11-02', endOn: '2026-11-20' },
        '2026-11-09',
        '2026-12-31',
      ),
    ).toEqual(['2026-11-16']);
  });

  it('counts fortnights from the start day and clamps the 31st to short months', () => {
    expect(
      occurrences({ frequency: 'quincenal', startOn: '2026-11-05' }, '2026-11-10', '2026-12-10'),
    ).toEqual(['2026-11-19', '2026-12-03']);
    expect(
      occurrences(
        { frequency: 'mensual', day: 31, startOn: '2026-01-01' },
        '2026-01-31',
        '2026-04-30',
      ),
    ).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
    expect(
      occurrences(
        { frequency: 'mensual', day: 29, startOn: '2028-01-01' },
        '2028-02-01',
        '2028-02-29',
      ),
    ).toEqual(['2028-02-29']);
  });

  it('repeats quarterly and yearly from its start month, and once is once', () => {
    expect(
      occurrences(
        { frequency: 'trimestral', day: 1, startOn: '2026-02-01' },
        '2026-03-01',
        '2027-02-28',
      ),
    ).toEqual(['2026-05-01', '2026-08-01', '2026-11-01', '2027-02-01']);
    expect(
      occurrences(
        { frequency: 'anual', day: 15, startOn: '2026-06-20' },
        '2026-01-01',
        '2028-12-31',
      ),
    ).toEqual(['2027-06-15', '2028-06-15']);
    expect(
      occurrences({ frequency: 'una_vez', startOn: '2026-12-24' }, '2026-12-23', '2026-12-24'),
    ).toEqual(['2026-12-24']);
    expect(
      occurrences({ frequency: 'una_vez', startOn: '2026-12-24' }, '2026-12-24', '2026-12-31'),
    ).toEqual([]);
  });

  it('a run split in two gives the same days as one run', () => {
    const w = { frequency: 'semanal', day: 3, startOn: '2026-01-07' } as const;
    expect([
      ...occurrences(w, '2026-01-01', '2026-02-11'),
      ...occurrences(w, '2026-02-11', '2026-03-31'),
    ]).toEqual(occurrences(w, '2026-01-01', '2026-03-31'));
    expect(perMonth('semanal') * 12).toBeCloseTo(52);
  });
});
