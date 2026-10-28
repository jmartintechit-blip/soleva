import { describe, expect, it } from 'vitest';
import { type Account, type Rule, accrue, applyRules, monthlyRate, netWorth } from './rules.ts';

const cash: Account = { id: 'cash', kind: 'efectivo', balanceCents: 100_000, annualRateBp: 0 };
const fund: Account = { id: 'fund', kind: 'inversion', balanceCents: 500_000, annualRateBp: 600 };
const loan: Account = { id: 'loan', kind: 'deuda', balanceCents: 30_000, annualRateBp: 900 };
const old: Account = {
  id: 'old',
  kind: 'efectivo',
  balanceCents: 70_000,
  annualRateBp: 0,
  archived: true,
};
const accounts = [cash, fund, loan, old];

const rule = (r: Partial<Rule> & Pick<Rule, 'id' | 'type' | 'amountCents'>): Rule => ({
  frequency: 'mensual',
  day: 1,
  startMonth: '2026-11',
  active: true,
  ...r,
});

describe('netWorth', () => {
  it('is assets minus debts, without archived accounts (invariant b)', () => {
    expect(netWorth(accounts)).toBe(100_000 + 500_000 - 30_000);
    expect(netWorth(accounts, { cash: 0, fund: 0, loan: 0 })).toBe(0);
  });
});

describe('applyRules', () => {
  it('adds income, takes out spending and moves between accounts', () => {
    const rules = [
      rule({ id: 'salary', type: 'entra', amountCents: 200_000, toAccountId: 'cash' }),
      rule({ id: 'rent', type: 'sale', amountCents: 80_000, fromAccountId: 'cash' }),
      rule({
        id: 'save',
        type: 'mueve',
        amountCents: 30_000,
        fromAccountId: 'cash',
        toAccountId: 'fund',
      }),
    ];
    expect(applyRules(accounts, rules, '2026-11')).toEqual({
      cash: 190_000,
      fund: 530_000,
      loan: 30_000,
    });
  });

  it('a move never changes net worth, even paying more than is owed (invariant a)', () => {
    const rules = [
      rule({
        id: 'save',
        type: 'mueve',
        amountCents: 30_000,
        fromAccountId: 'cash',
        toAccountId: 'fund',
      }),
      rule({
        id: 'pay',
        type: 'mueve',
        amountCents: 50_000,
        fromAccountId: 'cash',
        toAccountId: 'loan',
      }),
    ];
    const out = applyRules(accounts, rules, '2026-11');
    expect(out).toEqual({ cash: 40_000, fund: 530_000, loan: 0 });
    expect(netWorth(accounts, out)).toBe(netWorth(accounts));
  });

  it('runs in day order, day 31 on the last day of February', () => {
    // Income on 31 (→ 28) runs after the move on 15, so the move is not capped to 0.
    const rules = [
      rule({ id: 'a', type: 'entra', amountCents: 100_000, day: 31, toAccountId: 'loan' }),
      rule({
        id: 'b',
        type: 'mueve',
        amountCents: 10_000,
        day: 15,
        fromAccountId: 'cash',
        toAccountId: 'loan',
      }),
    ];
    // The move pays 10.000 of the 30.000 owed; the income then caps at the 20.000 left.
    expect(applyRules(accounts, rules, '2027-02').loan).toBe(0);
    expect(applyRules(accounts, rules, '2027-02').cash).toBe(90_000);
  });

  it('skips inactive, ended, paused and not-yet-started rules', () => {
    const base = { type: 'entra' as const, amountCents: 1_000, toAccountId: 'cash' };
    const rules = [
      rule({ id: 'off', ...base, active: false }),
      rule({ id: 'ended', ...base, endMonth: '2026-12' }),
      rule({ id: 'paused', ...base, pause: { from: '2027-01', to: '2027-03' } }),
      rule({ id: 'later', ...base, startMonth: '2027-02' }),
      rule({ id: 'q', ...base, frequency: 'trimestral' }),
    ];
    const cashIn = (m: string) => applyRules(accounts, rules, m).cash! - cash.balanceCents;
    expect(cashIn('2026-11')).toBe(3_000); // ended, paused, q
    expect(cashIn('2027-01')).toBe(0);
    expect(cashIn('2027-02')).toBe(2_000); // later, q
    expect(cashIn('2027-04')).toBe(2_000); // paused, later
  });

  it('ignores archived and missing accounts', () => {
    const rules = [
      rule({
        id: 'a',
        type: 'mueve',
        amountCents: 5_000,
        fromAccountId: 'old',
        toAccountId: 'cash',
      }),
      rule({ id: 'b', type: 'entra', amountCents: 5_000, toAccountId: 'nope' }),
    ];
    const out = applyRules(accounts, rules, '2026-11');
    expect(out).toEqual({ cash: 100_000, fund: 500_000, loan: 30_000 });
    expect(out).not.toHaveProperty('old');
  });

  it('pays nothing into a debt already at 0', () => {
    const rules = [
      rule({
        id: 'pay',
        type: 'mueve',
        amountCents: 5_000,
        fromAccountId: 'cash',
        toAccountId: 'loan',
      }),
    ];
    expect(applyRules(accounts, rules, '2026-11', { cash: 100_000, fund: 0, loan: 0 })).toEqual({
      cash: 100_000,
      fund: 0,
      loan: 0,
    });
  });

  it('keeps whole cents with the largest amounts (invariant d)', () => {
    const max = 99_999_999_999; // 999.999.999,99 €
    const big: Account = { ...cash, balanceCents: max };
    const rules = [rule({ id: 'x', type: 'entra', amountCents: max, toAccountId: 'cash' })];
    const out = applyRules([big], rules, '2026-11');
    expect(out.cash).toBe(2 * max);
    expect(Number.isSafeInteger(out.cash)).toBe(true);
  });
});

describe('accrue', () => {
  it('compounds monthly to the yearly rate', () => {
    expect(monthlyRate(600)).toBeCloseTo(1.06 ** (1 / 12) - 1, 15);
    expect((1 + monthlyRate(600, 250)) ** 12).toBeCloseTo(1.06 / 1.025, 12);
  });

  it('returns whole cents: positive interest on debts, negative for depreciation', () => {
    const car: Account = {
      id: 'car',
      kind: 'vehiculo',
      balanceCents: 1_000_000,
      annualRateBp: -1500,
    };
    const out = accrue([fund, loan, car, old]);
    expect(out).toEqual({
      fund: Math.round(500_000 * monthlyRate(600)),
      loan: Math.round(30_000 * monthlyRate(900)),
      car: -Math.round(1_000_000 * -monthlyRate(-1500)),
    });
    expect(Object.values(out).every(Number.isInteger)).toBe(true);
  });

  it('gives 0 on a 0 balance', () => {
    expect(accrue([fund], { fund: 0 })).toEqual({ fund: 0 });
  });

  it('20 years of monthly rounding stay within a cent a month of the exact value', () => {
    let rounded = 500_000;
    for (let t = 0; t < 240; t++) rounded += accrue([fund], { fund: rounded }).fund!;
    const exact = 500_000 * 1.06 ** 20;
    expect(Math.abs(rounded - exact)).toBeLessThan(240);
    expect(Number.isInteger(rounded)).toBe(true);
  });
});
