import { type Frequency, type Month, monthsBetween, occursIn, ruleDay } from './dates.ts';
import { roundHalfAwayFromZero } from './money.ts';

export type AccountKind =
  | 'efectivo'
  | 'remunerada'
  | 'inversion'
  | 'pension'
  | 'cripto'
  | 'inmueble'
  | 'vehiculo'
  | 'otro'
  | 'deuda';

export interface Account {
  id: string;
  kind: AccountKind;
  // What it is worth, or what is owed for a 'deuda'. Never negative in the database.
  balanceCents: number;
  // Yearly: interest, return, revaluation; negative for depreciation. Debts: the interest they charge.
  annualRateBp: number;
  archived?: boolean;
}

// Defaults when an account is created (PROJECT_PLAN §4): cars lose 15 % a year, homes stay flat.
export const DEFAULT_RATE_BP: Partial<Record<AccountKind, number>> = { vehiculo: -1500 };

export interface Rule {
  id: string;
  type: 'entra' | 'sale' | 'mueve';
  amountCents: number;
  frequency: Frequency;
  day: number;
  startMonth: Month;
  endMonth?: Month;
  fromAccountId?: string;
  toAccountId?: string;
  active: boolean;
  // Only for "¿qué pasa si…?": months (included) when the rule does not run. Never stored.
  pause?: { from: Month; to: Month };
}

export type Balances = Record<string, number>;

const isDebt = (a: Account | undefined) => a?.kind === 'deuda';

export function netWorth(accounts: Account[], balances?: Balances): number {
  let total = 0;
  for (const a of accounts) {
    if (a.archived) continue;
    const b = balances?.[a.id] ?? a.balanceCents;
    total += isDebt(a) ? -b : b;
  }
  return total;
}

function runs(rule: Rule, m: Month): boolean {
  if (!rule.active || !occursIn(rule, m)) return false;
  const p = rule.pause;
  return !p || monthsBetween(p.from, m) < 0 || monthsBetween(p.to, m) > 0;
}

// One month of rules, in day order. Money into a debt pays it off and is capped at what is owed,
// so a "mueve" never changes net worth. Rules that touch archived accounts do nothing.
// Works on any numbers: cents for the month close, unrounded values inside the projection.
export function applyRules(
  accounts: Account[],
  rules: Rule[],
  m: Month,
  start?: Balances,
): Balances {
  const byId = new Map(accounts.filter((a) => !a.archived).map((a) => [a.id, a]));
  const out: Balances = {};
  for (const a of byId.values()) out[a.id] = start?.[a.id] ?? a.balanceCents;
  const due = rules
    .filter((r) => runs(r, m))
    .sort((a, b) => ruleDay(a.day, m) - ruleDay(b.day, m) || a.id.localeCompare(b.id));
  for (const r of due) {
    const from = r.type === 'entra' ? undefined : byId.get(r.fromAccountId ?? '');
    const to = r.type === 'sale' ? undefined : byId.get(r.toAccountId ?? '');
    if ((r.type !== 'entra' && !from) || (r.type !== 'sale' && !to)) continue;
    const amount = isDebt(to) ? Math.min(r.amountCents, Math.max(0, out[to!.id]!)) : r.amountCents;
    if (from) out[from.id]! += isDebt(from) ? amount : -amount;
    if (to) out[to.id]! += isDebt(to) ? -amount : amount;
  }
  return out;
}

// Monthly rate equivalent to a yearly one, optionally deflated: (1 + r) / (1 + inflation) − 1.
export function monthlyRate(annualBp: number, inflationBp = 0): number {
  return ((1 + annualBp / 10_000) / (1 + inflationBp / 10_000)) ** (1 / 12) - 1;
}

// One month of interest, returns, revaluation or depreciation, in whole cents per account.
// Debt interest comes out positive (it adds to what is owed); the close shows it apart.
export function accrue(accounts: Account[], balances?: Balances): Balances {
  const out: Balances = {};
  for (const a of accounts) {
    if (a.archived) continue;
    const b = balances?.[a.id] ?? a.balanceCents;
    out[a.id] = roundHalfAwayFromZero(b * monthlyRate(a.annualRateBp));
  }
  return out;
}
