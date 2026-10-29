import type { Day } from './day.ts';

// The ledger as the engine sees it: the same rows as the movement table, amounts in cents and
// units, prices and rates as BigInt ×10^8.
export type MovementKind =
  | 'apertura'
  | 'ingreso'
  | 'gasto'
  | 'transferencia'
  | 'compra'
  | 'venta'
  | 'dividendo'
  | 'interes'
  | 'comision'
  | 'retencion'
  | 'amortizacion'
  | 'ajuste'
  | 'traspaso_valores'
  | 'split';

export interface Movement {
  accountId: string;
  day: Day;
  seq: number;
  kind: MovementKind;
  // Effect on the account's cash, signed, fees included.
  amountCents: number;
  instrumentId?: string;
  qtyE8?: bigint;
  priceE8?: bigint;
  fxE8?: bigint;
  feeCents?: number;
  withholdingCents?: number;
  transferId?: string;
  source: 'manual' | 'regla' | 'motor' | 'cuadre' | 'migracion';
  ruleId?: string;
  occurrenceKey?: string;
  provisional?: boolean;
  voided?: boolean;
}

export interface Holding {
  qtyE8: bigint;
  // What the units still held cost, in euros (average cost; FIFO is a separate reading).
  costCents: number;
}

export interface Book {
  cash: Map<string, number>;
  // Keyed `${accountId}|${instrumentId}`.
  holdings: Map<string, Holding>;
}

export const holdingKey = (accountId: string, instrumentId: string) =>
  `${accountId}|${instrumentId}`;

export const byDayAndSeq = (a: Movement, b: Movement) =>
  a.day < b.day ? -1 : a.day > b.day ? 1 : a.seq - b.seq;

// Cash and holdings after every live movement up to `upTo` (included). A fund switch carries the
// cost of the units it moves, so its out leg must come first (lower seq) on its day.
export function fold(movements: readonly Movement[], upTo?: Day): Book {
  const cash = new Map<string, number>();
  const holdings = new Map<string, Holding>();
  const switched = new Map<string, number>();
  for (const m of [...movements].sort(byDayAndSeq)) {
    if (m.voided || (upTo && m.day > upTo)) continue;
    cash.set(m.accountId, (cash.get(m.accountId) ?? 0) + m.amountCents);
    if (!m.instrumentId || m.qtyE8 === undefined) continue;
    const key = holdingKey(m.accountId, m.instrumentId);
    const h = holdings.get(key) ?? { qtyE8: 0n, costCents: 0 };
    if (m.kind === 'split') {
      h.qtyE8 += m.qtyE8;
    } else if (m.qtyE8 > 0n) {
      // A buy costs what left the cash; a switched-in lot, what it cost where it came from.
      h.costCents +=
        m.kind === 'traspaso_valores' ? (switched.get(m.transferId!) ?? 0) : -m.amountCents;
      h.qtyE8 += m.qtyE8;
    } else {
      // Selling or switching out takes its share of the cost along.
      const share = h.qtyE8 === 0n ? 0 : Number((BigInt(h.costCents) * -m.qtyE8) / h.qtyE8);
      h.costCents -= share;
      h.qtyE8 += m.qtyE8;
      if (m.kind === 'traspaso_valores') switched.set(m.transferId!, share);
    }
    holdings.set(key, h);
  }
  return { cash, holdings };
}
