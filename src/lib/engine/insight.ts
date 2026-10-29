import { type AutoRule, type EngineInput, type Market, advance } from './advance.ts';
import { type Day, addDays, daysBetween, isWeekend } from './day.ts';
import { type Movement, fold } from './ledger.ts';
import { roundHalfAwayFromZero } from './money.ts';
import { perMonth } from './schedule.ts';
import { E8, valueCents } from './units.ts';
import { assetCents, estimateCents, vehicleCents } from './valuation.ts';

export type AccountKind =
  | 'efectivo'
  | 'remunerada'
  | 'broker'
  | 'cripto'
  | 'deuda_hipoteca'
  | 'deuda_prestamo'
  | 'vehiculo'
  | 'bien'
  | 'inmueble'
  | 'pension'
  | 'deposito'
  | 'letra';
export type InstrumentKind = 'etf' | 'fondo' | 'accion' | 'etc' | 'cripto' | 'estimado';

export interface Holdings {
  accounts: { id: string; kind: AccountKind }[];
  instruments: Record<string, { kind: InstrumentKind }>;
  // Products without a public price: their user's yearly rate, per holding.
  estimates: Record<string, number>;
  vehicles: Record<
    string,
    {
      baseCents?: number;
      table: { yearsOver: number; pctBp: number }[];
      firstRegistration: Day;
      overrideCents?: number;
    }
  >;
  assets: Record<
    string,
    { purchaseCents: number; curve: { years: number; pctBp: number }[]; purchasedOn: Day }
  >;
  market: Market;
}

export type AssetClass =
  'liquidez' | 'renta_variable' | 'oro' | 'cripto' | 'inmuebles' | 'bienes' | 'deudas';

const DEBTS: AccountKind[] = ['deuda_hipoteca', 'deuda_prestamo'];
const CASH: AccountKind[] = [
  'efectivo',
  'remunerada',
  'broker',
  'cripto',
  'deposito',
  'letra',
  'pension',
];
const CLASS_OF: Record<InstrumentKind, AssetClass> = {
  etf: 'renta_variable',
  fondo: 'renta_variable',
  accion: 'renta_variable',
  estimado: 'renta_variable',
  etc: 'oro',
  cripto: 'cripto',
};

// What everything is worth on `day`, by account and by kind of asset. Cash and adjustments come
// from the ledger; units at the day's close in euros (estimates at their rate); a car and other
// goods at their valuation (a manual adjustment adds to it). Debts are negative, so net worth is
// the plain sum.
export function valuation(h: Holdings, ledger: readonly Movement[], day: Day) {
  const book = fold(ledger, day);
  const byAccount: Record<string, number> = {};
  const byClass: Record<AssetClass, number> = {
    liquidez: 0,
    renta_variable: 0,
    oro: 0,
    cripto: 0,
    inmuebles: 0,
    bienes: 0,
    deudas: 0,
  };
  const add = (account: string, cls: AssetClass, cents: number) => {
    byAccount[account] = (byAccount[account] ?? 0) + cents;
    byClass[cls] += cents;
  };
  for (const a of h.accounts) {
    const cash = book.cash.get(a.id) ?? 0;
    if (DEBTS.includes(a.kind)) add(a.id, 'deudas', cash);
    else if (a.kind === 'vehiculo' || a.kind === 'bien') {
      const v = h.vehicles[a.id];
      const g = h.assets[a.id];
      const base = v
        ? (v.overrideCents ??
          (v.baseCents ? vehicleCents(v.baseCents, v.table, v.firstRegistration, day) : 0))
        : g
          ? assetCents(g.purchaseCents, g.curve, g.purchasedOn, day)
          : 0;
      add(a.id, 'bienes', base + cash);
    } else add(a.id, a.kind === 'inmueble' ? 'inmuebles' : 'liquidez', cash);
  }
  for (const [key, held] of book.holdings) {
    const [account, instrument] = key.split('|') as [string, string];
    if (held.qtyE8 <= 0n) continue;
    const kind = h.instruments[instrument]!.kind;
    let cents: number;
    if (kind === 'estimado') {
      const buys = ledger
        .filter(
          (m) =>
            !m.voided &&
            m.accountId === account &&
            m.instrumentId === instrument &&
            m.qtyE8 &&
            m.day <= day,
        )
        .map((m) => ({ day: m.day, cents: -m.amountCents }));
      cents = estimateCents(buys, h.estimates[key] ?? 0, day);
    } else {
      const quote = h.market.close(instrument, day);
      const c = h.market.currency(instrument);
      const fx = c === 'EUR' ? E8 : h.market.perEur(c, day);
      // Without any price, at what it cost (and the stale-price alert says so).
      cents = quote && fx ? valueCents(held.qtyE8, quote.priceE8, fx) : held.costCents;
    }
    add(account, CLASS_OF[kind], cents);
  }
  const total = Object.values(byAccount).reduce((s, c) => s + c, 0);
  return { total, byAccount, byClass };
}

// What came into net worth from outside on each day: incomes, expenses, the openings and manual
// adjustments (money the app did not see coming). Transfers, buys and debt principal between own
// accounts never count; interest, dividends and prices are what the money made.
export const OUTSIDE: Movement['kind'][] = ['apertura', 'ingreso', 'gasto', 'ajuste'];
export const outsideFlows = (ledger: readonly Movement[], from: Day, to: Day) =>
  ledger.filter(
    (m) => !m.voided && m.day > from && m.day <= to && OUTSIDE.includes(m.kind) && !m.instrumentId,
  );

// Money-weighted return between two values: the yearly rate r that makes what was there at the
// start plus every flow worth what is there at the end (IRR, by Newton with bisection to fall
// back on), and that rate over the period's own length.
export function moneyWeighted(
  start: number,
  end: number,
  flows: { day: Day; cents: number }[],
  from: Day,
  to: Day,
) {
  const put = flows.reduce((s, f) => s + f.cents, 0);
  const made = end - start - put;
  const span = daysBetween(from, to);
  const cash = [
    { t: 0, c: -start },
    ...flows.map((f) => ({ t: daysBetween(from, f.day) / 365, c: -f.cents })),
    { t: span / 365, c: end },
  ];
  const npv = (r: number) => cash.reduce((s, x) => s + x.c / (1 + r) ** x.t, 0);
  let annual: number | null = null;
  if (cash.some((x) => x.c < 0) && cash.some((x) => x.c > 0) && span > 0) {
    let r = 0.05;
    for (let k = 0; k < 50 && annual === null; k++) {
      const f = npv(r);
      const df = cash.reduce((s, x) => s - (x.t * x.c) / (1 + r) ** (x.t + 1), 0);
      const next = r - f / df;
      if (!Number.isFinite(next) || next <= -0.9999) break;
      if (Math.abs(next - r) < 1e-10) annual = next;
      r = next;
    }
    if (annual === null) {
      let [lo, hi] = [-0.9999, 100];
      if (npv(lo) * npv(hi) < 0) {
        for (let k = 0; k < 200; k++) {
          const mid = (lo + hi) / 2;
          if (npv(lo) * npv(mid) <= 0) hi = mid;
          else lo = mid;
        }
        annual = (lo + hi) / 2;
      }
    }
  }
  const period = annual === null ? null : (1 + annual) ** (span / 365) - 1;
  return { putCents: put, madeCents: made, annual, period };
}

export type Alert = {
  kind: 'sin_saldo' | 'plan_supera' | 'fin_promocion' | 'precio_viejo';
  day: Day;
  accountId?: string;
  instrumentId?: string;
  ruleId?: string;
  key: string;
};

// Information about the user's own plan, never advice: when cash runs out in the next 60 days, a
// plan that spends more a month than comes into its account, a promotion ending within 30 days,
// a held price older than 5 business days.
// The cash forecast behind 'sin_saldo', kept between runs: simulated up to `through` from the
// balances it had there. While its fingerprint holds (same rules and settings, nothing changed by
// hand), each run only simulates the new days of the 60-day horizon.
export interface Forecast {
  fingerprint: string;
  through: Day;
  cash: Record<string, number>;
  firstNegative: Record<string, Day>;
}

// What the forecast depends on besides the calendar: the rules and settings, and every movement
// the engine did not make itself (by hand, a reconciliation, an opening, a void).
export function fingerprint(input: EngineInput, ledger: readonly Movement[]): string {
  const own = ledger
    .filter((m) => m.voided || !['regla', 'motor'].includes(m.source))
    .map((m) => `${m.accountId}${m.day}${m.amountCents}${m.voided ? 'v' : ''}`);
  const text = JSON.stringify(
    [input.rules, input.interest, input.debts, input.dividends, own],
    (_, v) => (typeof v === 'bigint' ? v.toString() : v),
  );
  // FNV-1a, twice with different seeds: a short, stable id for a long text.
  const fnv = (seed: number) => {
    let x = seed;
    for (let i = 0; i < text.length; i++) x = Math.imul(x ^ text.charCodeAt(i), 16777619) >>> 0;
    return x.toString(36);
  };
  return `${fnv(2166136261)}${fnv(374761393)}`;
}

// Simulates cash from balances at `from` to `to` (from one opening per account, never the whole
// ledger, so its cost does not grow with history). Interest accrued before `from` and dividends
// are left out: the forecast errs on the side of less cash.
function simulate(input: EngineInput, cash: Record<string, number>, from: Day, to: Day) {
  const openings: Movement[] = Object.entries(cash).map(([accountId, amountCents]) => ({
    accountId,
    day: from,
    seq: 0,
    kind: 'apertura',
    amountCents,
    source: 'motor',
  }));
  const moves = advance({ ...input, dividends: [] }, openings, from, to).sort((x, y) =>
    x.day < y.day ? -1 : x.day > y.day ? 1 : x.seq - y.seq,
  );
  const balance = { ...cash };
  const firstNegative: Record<string, Day> = {};
  for (const m of moves) {
    if (!(m.accountId in balance)) continue;
    balance[m.accountId]! += m.amountCents;
    if (balance[m.accountId]! < 0 && !firstNegative[m.accountId])
      firstNegative[m.accountId] = m.day;
  }
  return { cash: balance, firstNegative };
}

export function forecastCash(
  input: EngineInput,
  h: Holdings,
  ledger: readonly Movement[],
  today: Day,
  prior?: Forecast,
): Forecast {
  const print = fingerprint(input, ledger);
  const horizon = addDays(today, 60);
  if (prior?.fingerprint === print && prior.through >= today) {
    const kept = Object.fromEntries(
      Object.entries(prior.firstNegative).filter(([, d]) => d > today),
    );
    if (prior.through >= horizon) return { ...prior, firstNegative: kept };
    const next = simulate(input, prior.cash, prior.through, horizon);
    return {
      fingerprint: print,
      through: horizon,
      cash: next.cash,
      firstNegative: { ...next.firstNegative, ...kept },
    };
  }
  const book = fold(ledger, today).cash;
  const cash = Object.fromEntries(
    h.accounts.filter((a) => CASH.includes(a.kind)).map((a) => [a.id, book.get(a.id) ?? 0]),
  );
  const fresh = simulate(input, cash, today, horizon);
  return { fingerprint: print, through: horizon, ...fresh };
}

export function alerts(
  input: EngineInput,
  h: Holdings,
  ledger: readonly Movement[],
  today: Day,
  prior?: Forecast,
): { alerts: Alert[]; forecast: Forecast } {
  const out: Alert[] = [];
  const live = input.rules.filter((r) => r.active);
  const inflow = (account: string) =>
    live
      .filter(
        (r) => r.toAccountId === account && (r.kind === 'ingreso' || r.kind === 'transferencia'),
      )
      .reduce((s, r) => s + r.amountCents! * perMonth(r.frequency), 0);
  for (const r of live.filter((r): r is AutoRule => r.kind === 'plan')) {
    const spend = r.legs.reduce((s, l) => s + l.amountCents, 0) * perMonth(r.frequency);
    if (spend > inflow(r.fromAccountId!) + 0.5)
      out.push({
        kind: 'plan_supera',
        day: today,
        accountId: r.fromAccountId,
        ruleId: r.id,
        key: `plan_supera:${r.id}`,
      });
  }

  const forecast = forecastCash(input, h, ledger, today, prior);
  for (const [account, day] of Object.entries(forecast.firstNegative))
    out.push({ kind: 'sin_saldo', day, accountId: account, key: `sin_saldo:${account}` });

  for (const [id, t] of Object.entries(input.interest))
    if (t.promoUntil && t.promoUntil >= today && daysBetween(today, t.promoUntil) <= 30)
      out.push({
        kind: 'fin_promocion',
        day: t.promoUntil,
        accountId: id,
        key: `fin_promocion:${id}:${t.promoUntil}`,
      });

  const held = new Set(
    [...fold(ledger, today).holdings]
      .filter(([, v]) => v.qtyE8 > 0n)
      .map(([k]) => k.split('|')[1]!),
  );
  for (const id of held) {
    if (h.instruments[id]?.kind === 'estimado') continue;
    const quote = h.market.close(id, today);
    if (!quote || businessDaysBetween(quote.day, today) > 5)
      out.push({
        kind: 'precio_viejo',
        day: quote?.day ?? today,
        instrumentId: id,
        key: `precio_viejo:${id}`,
      });
  }
  return { alerts: out, forecast };
}

function businessDaysBetween(from: Day, to: Day) {
  let n = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (!isWeekend(d)) n++;
  return n;
}

export const percent = (x: number | null) =>
  x === null ? null : roundHalfAwayFromZero(x * 10_000);
