import type { Day } from './day.ts';
import { type Movement, fold, holdingKey } from './ledger.ts';
import { unitsFor } from './units.ts';

// Cuadre: the user says what is really there and the ledger moves to it with one 'ajuste' that
// keeps the difference (nothing if it already matches). Cash by its balance, a holding by its
// units (at no cost: the money for them was never seen).
export function reconcile(
  ledger: readonly Movement[],
  accountId: string,
  day: Day,
  real: { cashCents: number } | { instrumentId: string; qtyE8: bigint },
): Movement | null {
  const book = fold(ledger, day);
  const base = { accountId, day, seq: 999, kind: 'ajuste' as const, source: 'cuadre' as const };
  if ('cashCents' in real) {
    const diff = real.cashCents - (book.cash.get(accountId) ?? 0);
    return diff === 0 ? null : { ...base, amountCents: diff };
  }
  const held = book.holdings.get(holdingKey(accountId, real.instrumentId))?.qtyE8 ?? 0n;
  const diff = real.qtyE8 - held;
  return diff === 0n
    ? null
    : { ...base, amountCents: 0, instrumentId: real.instrumentId, qtyE8: diff };
}

// A provisional buy once its day's close is out: same money, the units that money really bought.
export function reprice(m: Movement, priceE8: bigint, fxE8: bigint): Movement {
  return {
    ...m,
    priceE8,
    fxE8,
    qtyE8: unitsFor(-m.amountCents, priceE8, fxE8),
    provisional: false,
  };
}
