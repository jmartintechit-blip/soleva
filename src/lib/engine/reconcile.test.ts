import { describe, expect, it } from 'vitest';
import { type Movement, fold, holdingKey } from './ledger.ts';
import { reconcile, reprice } from './reconcile.ts';
import { E8, toE8 } from './units.ts';

const ledger: Movement[] = [
  {
    accountId: 'b',
    day: '2026-11-01',
    seq: 0,
    kind: 'apertura',
    amountCents: 100_000,
    source: 'migracion',
  },
  {
    accountId: 'b',
    day: '2026-11-02',
    seq: 0,
    kind: 'compra',
    amountCents: -10_000,
    instrumentId: 'w',
    qtyE8: toE8(1),
    priceE8: toE8(100),
    fxE8: E8,
    provisional: true,
    source: 'regla',
  },
];

describe('reconcile', () => {
  it('moves cash or units to what is really there, keeping the difference', () => {
    const cash = reconcile(ledger, 'b', '2026-11-10', { cashCents: 89_000 });
    expect(cash).toMatchObject({ kind: 'ajuste', source: 'cuadre', amountCents: -1_000 });
    expect(fold([...ledger, cash!]).cash.get('b')).toBe(89_000);
    const units = reconcile(ledger, 'b', '2026-11-10', { instrumentId: 'w', qtyE8: toE8('1.25') });
    expect(units).toMatchObject({ amountCents: 0, qtyE8: toE8('0.25') });
    expect(fold([...ledger, units!]).holdings.get(holdingKey('b', 'w'))).toEqual({
      qtyE8: toE8('1.25'),
      costCents: 10_000,
    });
    expect(reconcile(ledger, 'b', '2026-11-10', { cashCents: 90_000 })).toBeNull();
  });

  it('reprices a provisional buy at its real close: same money, other units', () => {
    expect(reprice(ledger[1]!, toE8(80), E8)).toMatchObject({
      amountCents: -10_000,
      qtyE8: toE8('1.25'),
      priceE8: toE8(80),
      provisional: false,
    });
  });
});
