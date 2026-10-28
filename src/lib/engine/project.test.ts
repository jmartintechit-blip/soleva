import { describe, expect, it } from 'vitest';
import { ASSUMPTIONS_BP, futureValue } from './compound.ts';
import {
  extraMonthly,
  oneOffExpense,
  pauseContributions,
  project,
  projectScenarios,
  status,
} from './project.ts';
import type { Account, Rule } from './rules.ts';

const fund: Account = { id: 'fund', kind: 'inversion', balanceCents: 1_000_000, annualRateBp: 0 };
const cash: Account = { id: 'cash', kind: 'efectivo', balanceCents: 200_000, annualRateBp: 0 };
const saving: Rule = {
  id: 'save',
  type: 'entra',
  amountCents: 30_000,
  frequency: 'mensual',
  day: 5,
  startMonth: '2026-11',
  toAccountId: 'fund',
  active: true,
};
const base = { annualBp: ASSUMPTIONS_BP.base, inflationBp: ASSUMPTIONS_BP.inflation };
const last = <T>(xs: T[]) => xs[xs.length - 1]!;

describe('project', () => {
  it('matches the compound-interest calculator in the simple case', () => {
    const points = project([fund], [saving], '2026-10', base, 120);
    expect(points).toHaveLength(120);
    expect(points[0]!.month).toBe('2026-11');
    expect(last(points).month).toBe('2036-10');
    const expected = futureValue({ startCents: 1_000_000, monthlyCents: 30_000, months: 120 }, 600);
    expect(Math.abs(last(points).realCents - expected)).toBeLessThanOrEqual(1);
    expect(last(points).contributedCents).toBe(1_000_000 + 30_000 * 120);
  });

  it('shows euros of that month above euros of today', () => {
    const p = last(project([fund], [saving], '2026-10', base, 12));
    expect(Math.abs(p.nominalCents - p.realCents * 1.025)).toBeLessThanOrEqual(1);
  });

  it('a move between accounts adds nothing to what you put in', () => {
    const move: Rule = { ...saving, type: 'mueve', fromAccountId: 'cash' };
    const points = project([fund, cash], [move], '2026-10', base, 24);
    expect(last(points).contributedCents).toBe(1_200_000);
  });

  it('leaves archived accounts out', () => {
    const archived = { ...cash, archived: true };
    expect(project([fund, archived], [], '2026-10', base, 1)[0]!.contributedCents).toBe(1_000_000);
  });

  it('pays a debt down to 0 and no further', () => {
    const loan: Account = { id: 'loan', kind: 'deuda', balanceCents: 50_000, annualRateBp: 0 };
    const pay: Rule = { ...saving, type: 'mueve', fromAccountId: 'cash', toAccountId: 'loan' };
    const points = project([cash, loan], [pay], '2026-10', { annualBp: 0, inflationBp: 0 }, 6);
    expect(points.map((p) => p.realCents)).toEqual(Array(6).fill(150_000));
  });

  it('orders the three scenarios over 20 years in whole cents', () => {
    const s = projectScenarios([fund], [saving], '2026-10', 240);
    const [p, b, o] = [s.prudente, s.base, s.optimista].map((xs) => last(xs).realCents);
    expect(p).toBeLessThan(b!);
    expect(b).toBeLessThan(o!);
    expect(
      Object.values(s)
        .flat()
        .every((x) => Number.isInteger(x.realCents)),
    ).toBe(true);
  });
});

describe('status', () => {
  it('turns "por debajo" only beyond 3 % under the plan', () => {
    expect(status(97_000, 100_000)).toEqual({ level: 'en_camino', gapCents: -3_000 });
    expect(status(96_999, 100_000).level).toBe('por_debajo');
    expect(status(120_000, 100_000).level).toBe('en_camino');
    expect(status(0, 0).level).toBe('en_camino');
  });
});

describe('¿qué pasa si…?', () => {
  // Cash earning inflation keeps its euros of today, so a one-off expense is not diluted.
  const wallet = { ...cash, annualRateBp: ASSUMPTIONS_BP.inflation };
  const run = (rules: Rule[]) =>
    last(project([fund, wallet], rules, '2026-10', base, 60)).realCents;
  const plan = run([saving]);

  it('more each month ends higher', () => {
    expect(run(extraMonthly([saving], 'fund', 10_000, '2026-11'))).toBeGreaterThan(plan);
  });

  it('pausing contributions for 6 months ends lower by what was not put in plus its growth', () => {
    const paused = pauseContributions([fund, wallet], [saving], '2026-11', 6);
    expect(paused[0]!.pause).toEqual({ from: '2026-11', to: '2027-04' });
    const gap = plan - run(paused);
    expect(gap).toBeGreaterThan(6 * 30_000);
    // 5 years at 6 % over 2,5 % inflation grow it by under a fifth.
    expect(gap).toBeLessThan(6 * 30_000 * 1.2);
  });

  it('a one-off expense from cash ends lower by exactly that amount', () => {
    const rules = oneOffExpense([saving], 'cash', 100_000, '2027-03');
    expect(plan - run(rules)).toBe(100_000);
  });

  it('never changes the stored rules', () => {
    const stored = [saving];
    extraMonthly(stored, 'fund', 1, '2026-11');
    pauseContributions([fund], stored, '2026-11', 1);
    expect(stored).toEqual([saving]);
    expect(stored[0]!.pause).toBeUndefined();
  });
});
