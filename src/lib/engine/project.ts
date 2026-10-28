import { ASSUMPTIONS_BP } from './compound.ts';
import { type Month, addMonths } from './dates.ts';
import { roundHalfAwayFromZero } from './money.ts';
import {
  type Account,
  type AccountKind,
  type Rule,
  applyRules,
  monthlyRate,
  netWorth,
} from './rules.ts';

// These grow at the scenario's return; every other account at its own rate.
const INVESTED: AccountKind[] = ['inversion', 'pension', 'cripto'];

export interface Assumptions {
  annualBp: number;
  inflationBp: number;
}

export interface Point {
  month: Month;
  // Net worth in euros of today and in euros of that month.
  realCents: number;
  nominalCents: number;
  // Net worth today plus what rules bring in minus what they take out; the rest is return.
  contributedCents: number;
}

// Month by month in euros of today, like compound.ts: rates are deflated and rule amounts are
// taken as today's euros (they rise with inflation). Each month accrues first, then runs its rules.
export function project(
  accounts: Account[],
  rules: Rule[],
  from: Month,
  { annualBp, inflationBp }: Assumptions,
  months: number,
): Point[] {
  const live = accounts.filter((a) => !a.archived);
  const rate = new Map(
    live.map((a) => [
      a.id,
      monthlyRate(INVESTED.includes(a.kind) ? annualBp : a.annualRateBp, inflationBp),
    ]),
  );
  const inflation = monthlyRate(inflationBp);
  let balances = Object.fromEntries(live.map((a) => [a.id, a.balanceCents]));
  let contributed = netWorth(live);
  const points: Point[] = [];
  for (let t = 1; t <= months; t++) {
    const month = addMonths(from, t);
    for (const a of live) balances[a.id]! *= 1 + rate.get(a.id)!;
    // Contributions: the change rules alone make to net worth (moves add nothing).
    const before = netWorth(live, balances);
    balances = applyRules(live, rules, month, balances);
    const real = netWorth(live, balances);
    contributed += real - before;
    points.push({
      month,
      realCents: roundHalfAwayFromZero(real),
      nominalCents: roundHalfAwayFromZero(real * (1 + inflation) ** t),
      contributedCents: roundHalfAwayFromZero(contributed),
    });
  }
  return points;
}

export const SCENARIOS = ['prudente', 'base', 'optimista'] as const;

export function projectScenarios(
  accounts: Account[],
  rules: Rule[],
  from: Month,
  months: number,
  bp = ASSUMPTIONS_BP,
) {
  return Object.fromEntries(
    SCENARIOS.map((s) => [
      s,
      project(accounts, rules, from, { annualBp: bp[s], inflationBp: bp.inflation }, months),
    ]),
  ) as Record<(typeof SCENARIOS)[number], Point[]>;
}

// Below this share of the plan, the light turns to "Algo por debajo del plan" (🟡 editable).
export const BELOW_PLAN_BP = 300;

export interface Status {
  level: 'en_camino' | 'por_debajo';
  // Actual minus planned: the "why" the screen explains, without blame.
  gapCents: number;
}

export function status(actualCents: number, plannedCents: number): Status {
  const gapCents = actualCents - plannedCents;
  const below = gapCents * 10_000 < -BELOW_PLAN_BP * Math.abs(plannedCents);
  return { level: below ? 'por_debajo' : 'en_camino', gapCents };
}

// "¿Qué pasa si…?": each returns new rules to project again; none touches the stored ones.
const nextId = (rules: Rule[]) => `que-pasa-si-${rules.length}`;

export function extraMonthly(
  rules: Rule[],
  toAccountId: string,
  amountCents: number,
  from: Month,
): Rule[] {
  return [
    ...rules,
    {
      id: nextId(rules),
      type: 'entra',
      amountCents,
      frequency: 'mensual',
      day: 1,
      startMonth: from,
      toAccountId,
      active: true,
    },
  ];
}

// Pauses what goes into invested accounts (contributions), for `months` months from `from`.
export function pauseContributions(
  accounts: Account[],
  rules: Rule[],
  from: Month,
  months: number,
): Rule[] {
  const invested = new Set(accounts.filter((a) => INVESTED.includes(a.kind)).map((a) => a.id));
  const pause = { from, to: addMonths(from, months - 1) };
  return rules.map((r) =>
    r.type !== 'sale' && invested.has(r.toAccountId ?? '') ? { ...r, pause } : r,
  );
}

export function oneOffExpense(
  rules: Rule[],
  fromAccountId: string,
  amountCents: number,
  month: Month,
): Rule[] {
  return [
    ...rules,
    {
      id: nextId(rules),
      type: 'sale',
      amountCents,
      frequency: 'una_vez',
      day: 1,
      startMonth: month,
      fromAccountId,
      active: true,
    },
  ];
}
