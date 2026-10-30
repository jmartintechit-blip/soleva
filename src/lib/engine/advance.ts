import { type DebtTerms, amortization } from './debt.ts';
import { type Day, addDays, dayIn, daysAfter, isWeekend, monthOf } from './day.ts';
import { type InterestTerms, dailyAccrual, isPayDay, payment } from './interest.ts';
import { type Movement, byDayAndSeq, fold, holdingKey } from './ledger.ts';
import { type AutoFrequency, occurrences } from './schedule.ts';
import { E8, divRound, unitsFor, valueCents } from './units.ts';

export interface AutoRule {
  id: string;
  kind: 'transferencia' | 'ingreso' | 'gasto' | 'plan';
  frequency: AutoFrequency;
  day?: number;
  startOn: Day;
  endOn?: Day;
  fromAccountId?: string;
  toAccountId?: string;
  amountCents?: number;
  legs: { instrumentId: string; amountCents: number }[];
  active: boolean;
}

export interface Dividend {
  accountId: string;
  instrumentId: string;
  perUnitE8: bigint;
  payMonths: number[];
  payDay: number;
  withholdingOriginBp: number;
  withholdingEsBp: number;
}

// The latest close (or ECB rate) published on or before a day.
export interface Market {
  close(instrumentId: string, day: Day): { day: Day; priceE8: bigint } | undefined;
  perEur(currency: string, day: Day): bigint | undefined;
  currency(instrumentId: string): string;
}

export interface EngineInput {
  rules: AutoRule[];
  interest: Record<string, InterestTerms>;
  dividends: Dividend[];
  debts: Record<string, DebtTerms & { payerAccountId?: string }>;
  market: Market;
}

const FIRST_SEQ = 100;

// A plan bought on a weekend executes on the next Monday (no close on Saturday or Sunday).
const businessDay = (d: Day): Day => (isWeekend(d) ? businessDay(addDays(d, 1)) : d);

// The movements the engine owes for the days after `from` up to `to`, given the ledger so far.
// Deterministic and idempotent: every movement has an occurrence key, and one already in the
// ledger is never made again, so a run split in pieces, repeated or late gives the same ledger.
export function advance(input: EngineInput, ledger: readonly Movement[], from: Day, to: Day) {
  const done = new Set(ledger.map((m) => m.occurrenceKey).filter(Boolean));
  const out: Movement[] = [];
  const all = [...ledger].sort(byDayAndSeq);
  const cash = fold(all, from).cash;
  const accrued = interestSince(input, all, from);
  let seq = FIRST_SEQ;

  const emit = (m: Omit<Movement, 'seq' | 'source'> & { source?: Movement['source'] }) => {
    if (done.has(m.occurrenceKey)) return;
    done.add(m.occurrenceKey);
    const row: Movement = { source: 'motor', ...m, seq: seq++ };
    out.push(row);
    cash.set(row.accountId, (cash.get(row.accountId) ?? 0) + row.amountCents);
  };

  const live = input.rules.filter((r) => r.active);
  for (const d of daysAfter(from, to)) {
    seq = FIRST_SEQ;
    // What was already written for this day (by hand, or by an earlier run) moves cash first.
    for (const m of all)
      if (m.day === d && !m.voided)
        cash.set(m.accountId, (cash.get(m.accountId) ?? 0) + m.amountCents);
    const today = (r: AutoRule) => occurrences(r, addDays(d, -1), d).length > 0;

    for (const r of live.filter((r) => r.kind === 'ingreso' && today(r)))
      emit({
        accountId: r.toAccountId!,
        day: d,
        kind: 'ingreso',
        amountCents: r.amountCents!,
        ruleId: r.id,
        occurrenceKey: `rule:${r.id}:${d}`,
        source: 'regla',
      });
    for (const r of live.filter((r) => r.kind === 'transferencia' && today(r))) {
      const t = `rule:${r.id}:${d}`;
      emit({
        accountId: r.fromAccountId!,
        day: d,
        kind: 'transferencia',
        amountCents: -r.amountCents!,
        transferId: t,
        ruleId: r.id,
        occurrenceKey: `${t}:out`,
        source: 'regla',
      });
      emit({
        accountId: r.toAccountId!,
        day: d,
        kind: 'transferencia',
        amountCents: r.amountCents!,
        transferId: t,
        ruleId: r.id,
        occurrenceKey: `${t}:in`,
        source: 'regla',
      });
    }
    for (const r of live.filter((r) => r.kind === 'gasto' && today(r)))
      emit({
        accountId: r.fromAccountId!,
        day: d,
        kind: 'gasto',
        amountCents: -r.amountCents!,
        ruleId: r.id,
        occurrenceKey: `rule:${r.id}:${d}`,
        source: 'regla',
      });

    // Plans: each occurrence buys on its business day at the last close; without that day's close
    // yet, the buy is provisional and gets repriced when it is published.
    if (!isWeekend(d))
      for (const r of live.filter((r) => r.kind === 'plan'))
        for (const occ of occurrences(r, addDays(d, -3), d).filter((o) => businessDay(o) === d))
          r.legs.forEach((leg, i) => {
            const key = `rule:${r.id}:${occ}:${i}`;
            const quote = input.market.close(leg.instrumentId, d);
            const fx = perEur(input.market, leg.instrumentId, d);
            if (!quote || !fx) return; // no price at all: the stale-price alert says so
            emit({
              accountId: r.fromAccountId!,
              day: d,
              kind: 'compra',
              amountCents: -leg.amountCents,
              instrumentId: leg.instrumentId,
              qtyE8: unitsFor(leg.amountCents, quote.priceE8, fx),
              priceE8: quote.priceE8,
              fxE8: fx,
              provisional: quote.day < d,
              ruleId: r.id,
              occurrenceKey: key,
              source: 'regla',
            });
          });

    // Debt payments: interest is an expense of the payer; the principal moves from the payer to
    // the debt (which is negative), so it never changes net worth.
    for (const [debtId, t] of Object.entries(input.debts)) {
      const p = t.payerAccountId && amortization(t).find((x) => x.day === d);
      if (!p) continue;
      const k = `debt:${debtId}:${d}`;
      emit({
        accountId: t.payerAccountId!,
        day: d,
        kind: 'gasto',
        amountCents: -p.interestCents,
        occurrenceKey: `${k}:interes`,
      });
      emit({
        accountId: t.payerAccountId!,
        day: d,
        kind: 'amortizacion',
        amountCents: -p.principalCents,
        transferId: k,
        occurrenceKey: `${k}:out`,
      });
      emit({
        accountId: debtId,
        day: d,
        kind: 'amortizacion',
        amountCents: p.principalCents,
        transferId: k,
        occurrenceKey: `${k}:in`,
      });
    }

    // Dividends on the units held at the end of the day before.
    if (input.dividends.length) {
      const held = fold([...all, ...out], addDays(d, -1)).holdings;
      for (const v of input.dividends) {
        if (!v.payMonths.includes(Number(d.slice(5, 7))) || dayIn(monthOf(d), v.payDay) !== d)
          continue;
        const qty = held.get(holdingKey(v.accountId, v.instrumentId))?.qtyE8 ?? 0n;
        const fx = perEur(input.market, v.instrumentId, d);
        if (qty <= 0n || !fx) continue;
        const gross = valueCents(qty, v.perUnitE8, fx);
        const withheld = Number(
          divRound(BigInt(gross) * BigInt(v.withholdingOriginBp + v.withholdingEsBp), 10_000n),
        );
        emit({
          accountId: v.accountId,
          day: d,
          kind: 'dividendo',
          amountCents: gross - withheld,
          withholdingCents: withheld,
          instrumentId: v.instrumentId,
          occurrenceKey: `div:${v.accountId}:${v.instrumentId}:${d}`,
        });
      }
    }

    // Interest: accrued on the day's closing balance, paid (net of withholding) on its day.
    for (const [id, t] of Object.entries(input.interest)) {
      accrued[id] = (accrued[id] ?? 0n) + dailyAccrual(cash.get(id) ?? 0, t, d);
      if (!isPayDay(t, d)) continue;
      const { net, withheld } = payment(accrued[id]!, t);
      accrued[id] = 0n;
      if (net + withheld > 0)
        emit({
          accountId: id,
          day: d,
          kind: 'interes',
          amountCents: net,
          withholdingCents: withheld,
          occurrenceKey: `int:${id}:${d}`,
        });
    }
  }
  return out;
}

const perEur = (market: Market, instrumentId: string, d: Day) => {
  const c = market.currency(instrumentId);
  return c === 'EUR' ? E8 : market.perEur(c, d);
};

// Interest earned and not paid yet at the end of `day`, net of what will be withheld: part of the
// account's value (and of what it made), so paying it changes nothing but where it sits.
export function accruedInterest(input: EngineInput, ledger: readonly Movement[], day: Day) {
  return Object.fromEntries(
    Object.entries(interestSince(input, [...ledger], day)).map(([id, micro]) => [
      id,
      payment(micro, input.interest[id]!).net,
    ]),
  );
}

// Interest accrued and not yet paid when a run starts: replayed from the last pay day (at most a
// year back) on the ledger's own closing balances, so no state has to be stored for it.
function interestSince(input: EngineInput, ledger: Movement[], from: Day) {
  const accrued: Record<string, bigint> = {};
  for (const [id, t] of Object.entries(input.interest)) {
    let start = from;
    for (let k = 0; k < 366 && !isPayDay(t, start); k++) start = addDays(start, -1);
    if (!isPayDay(t, start)) continue;
    const own = ledger.filter((m) => m.accountId === id && !m.voided);
    let balance = own.filter((m) => m.day <= start).reduce((s, m) => s + m.amountCents, 0);
    let sum = 0n;
    for (const d of daysAfter(start, from)) {
      for (const m of own) if (m.day === d) balance += m.amountCents;
      sum += dailyAccrual(balance, t, d);
    }
    accrued[id] = sum;
  }
  return accrued;
}
