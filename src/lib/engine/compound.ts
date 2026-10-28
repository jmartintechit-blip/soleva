import { roundHalfAwayFromZero } from './money.ts';

export type Scenario = 'prudente' | 'base' | 'optimista';

// Default assumptions (PROJECT_PLAN §4), editable later in Ajustes.
export const ASSUMPTIONS_BP = { prudente: 300, base: 600, optimista: 800, inflation: 250 };

export interface Plan {
  startCents: number;
  monthlyCents: number;
  months: number;
}

// Value in euros of today: the yearly return is deflated, (1 + r) / (1 + inflation) − 1, and
// compounded monthly; each contribution goes in at the end of its month.
export function futureValue(
  { startCents, monthlyCents, months }: Plan,
  annualBp: number,
  inflationBp = ASSUMPTIONS_BP.inflation,
): number {
  const real = (1 + annualBp / 10_000) / (1 + inflationBp / 10_000);
  const i = real ** (1 / 12) - 1;
  const growth = (1 + i) ** months;
  const fromMonthly = Math.abs(i) < 1e-12 ? months : (growth - 1) / i;
  return roundHalfAwayFromZero(startCents * growth + monthlyCents * fromMonthly);
}

export function contributed({ startCents, monthlyCents, months }: Plan): number {
  return startCents + monthlyCents * months;
}

export function scenarios(plan: Plan): Record<Scenario, number> {
  return {
    prudente: futureValue(plan, ASSUMPTIONS_BP.prudente),
    base: futureValue(plan, ASSUMPTIONS_BP.base),
    optimista: futureValue(plan, ASSUMPTIONS_BP.optimista),
  };
}
