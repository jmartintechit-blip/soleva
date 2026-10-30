import { describe, expect, it } from 'vitest';
import { type AutoRule, type EngineInput, advance } from './advance.ts';
import { market } from './testing.ts';
import { type Day, addDays } from './day.ts';
import type { InterestTerms } from './interest.ts';
import { type Movement, fold, holdingKey } from './ledger.ts';
import { E8, toE8 } from './units.ts';

const opening = (accountId: string, cents: number, day = '2026-10-31'): Movement => ({
  accountId,
  day,
  seq: 0,
  kind: 'apertura',
  amountCents: cents,
  source: 'migracion',
});

const rule = (r: Partial<AutoRule> & Pick<AutoRule, 'id' | 'kind' | 'frequency'>): AutoRule => ({
  startOn: '2026-01-01',
  legs: [],
  active: true,
  ...r,
});

const none: EngineInput = { rules: [], interest: {}, dividends: [], debts: {}, market: market({}) };

describe('advance', () => {
  it('moves money on its day, both legs of a transfer, and never twice', () => {
    const input: EngineInput = {
      ...none,
      rules: [
        rule({
          id: 'n',
          kind: 'ingreso',
          frequency: 'mensual',
          day: 28,
          toAccountId: 'rem',
          amountCents: 200_000,
        }),
        rule({
          id: 't',
          kind: 'transferencia',
          frequency: 'mensual',
          day: 1,
          fromAccountId: 'rem',
          toAccountId: 'brk',
          amountCents: 180_000,
        }),
        rule({
          id: 'a',
          kind: 'gasto',
          frequency: 'mensual',
          day: 30,
          fromAccountId: 'aut',
          amountCents: 9_000,
        }),
        rule({
          id: 'off',
          kind: 'gasto',
          frequency: 'mensual',
          day: 2,
          fromAccountId: 'aut',
          amountCents: 1,
          active: false,
        }),
      ],
    };
    const ledger = [opening('rem', 1_000_000), opening('aut', 50_000)];
    const out = advance(input, ledger, '2026-10-31', '2026-11-30');
    expect(out.map((m) => [m.day, m.accountId, m.kind, m.amountCents])).toEqual([
      ['2026-11-01', 'rem', 'transferencia', -180_000],
      ['2026-11-01', 'brk', 'transferencia', 180_000],
      ['2026-11-28', 'rem', 'ingreso', 200_000],
      ['2026-11-30', 'aut', 'gasto', -9_000],
    ]);
    expect(out[0]!.transferId).toBe(out[1]!.transferId);
    // Again over the same days: nothing new.
    expect(advance(input, [...ledger, ...out], '2026-10-31', '2026-11-30')).toEqual([]);
  });

  it('buys a weekly plan at that day’s close, Saturdays on Monday, provisional until its close', () => {
    const input: EngineInput = {
      ...none,
      rules: [
        rule({
          id: 'p',
          kind: 'plan',
          frequency: 'semanal',
          day: 6,
          startOn: '2026-11-01',
          fromAccountId: 'brk',
          legs: [
            { instrumentId: 'world', amountCents: 5_000 },
            { instrumentId: 'eth', amountCents: 2_500 },
          ],
        }),
      ],
      market: market({
        world: { currency: 'USD', price: '108.50' },
        eth: { currency: 'EUR', price: '3210.99' },
      }),
    };
    const out = advance(input, [opening('brk', 100_000)], '2026-10-31', '2026-11-09');
    // Saturday 7 November executes on Monday 9.
    expect(out.map((m) => [m.day, m.instrumentId, m.amountCents, m.qtyE8, m.provisional])).toEqual([
      ['2026-11-09', 'world', -5_000, toE8('0.5'), false],
      ['2026-11-09', 'eth', -2_500, toE8('0.00778576'), false],
    ]);
    expect(out[0]!.occurrenceKey).toBe('rule:p:2026-11-07:0');
    expect(out[0]!.fxE8).toBe(toE8('1.085'));
    expect(out[1]!.fxE8).toBe(E8);

    // A Monday with only Friday's close published: bought at it, provisional.
    const stale = {
      ...input,
      market: {
        ...input.market,
        close: (id: string, day: Day) =>
          input.market.close(id, day === '2026-11-09' ? '2026-11-06' : day),
      },
    };
    const late = advance(stale, [opening('brk', 100_000)], '2026-10-31', '2026-11-09');
    expect(late.map((m) => m.provisional)).toEqual([true, true]);
    // Without any price, nothing is bought (the stale-price alert tells).
    const unpriced = {
      ...input,
      market: market({
        world: { currency: 'USD', price: '1', from: '2027-01-01' },
        eth: { currency: 'EUR', price: '1' },
      }),
    };
    expect(advance(unpriced, [], '2026-10-31', '2026-11-09').map((m) => m.instrumentId)).toEqual([
      'eth',
    ]);
  });

  it('pays interest on each day’s real balance while a plan spends it', () => {
    const t: InterestTerms = {
      tiers: [{ rateBp: 250 }],
      baseDays: 365,
      payFrequency: 'mensual',
      payDay: 31,
      withholdingBp: 1900,
    };
    const plan = rule({
      id: 'p',
      kind: 'plan',
      frequency: 'semanal',
      day: 1,
      startOn: '2026-11-01',
      fromAccountId: 'brk',
      legs: [{ instrumentId: 'world', amountCents: 50_000 }],
    });
    const input: EngineInput = {
      ...none,
      interest: { brk: t },
      market: market({ world: { currency: 'EUR', price: '100' } }),
    };
    const still = advance(input, [opening('brk', 1_000_000)], '2026-10-31', '2026-11-30');
    const spent = advance(
      { ...input, rules: [plan] },
      [opening('brk', 1_000_000)],
      '2026-10-31',
      '2026-11-30',
    );
    const paid = (ms: Movement[]) => ms.find((m) => m.kind === 'interes')!;
    // 10.000 € for 30 days at 2,5 %: 20,54 € gross, 16,64 € after 19 %.
    expect(paid(still)).toMatchObject({
      day: '2026-11-30',
      amountCents: 1_664,
      withholdingCents: 390,
    });
    // Mondays 2, 9, 16, 23 and 30 take 500 € each: 10.000 € one day, 9.500, 9.000, 8.500 and
    // 8.000 € seven days each, 7.500 € the last: 262.500 €·day × 2,5 % / 365 = 17,979 €.
    expect(paid(spent).amountCents + paid(spent).withholdingCents!).toBe(1_797);
  });

  it('splits a debt payment into interest (an expense) and principal (a transfer to the debt)', () => {
    const input: EngineInput = {
      ...none,
      debts: {
        loan: {
          principalCents: 1_200_000,
          startOn: '2026-10-05',
          firstPaymentOn: '2026-11-05',
          termMonths: 12,
          rateType: 'fijo',
          initialRateBp: 600,
          payerAccountId: 'cash',
        },
      },
    };
    const ledger = [opening('cash', 500_000), opening('loan', -1_200_000)];
    const out = advance(input, ledger, '2026-10-31', '2026-11-30');
    expect(out.map((m) => [m.accountId, m.kind, m.amountCents])).toEqual([
      ['cash', 'gasto', -6_000],
      ['cash', 'amortizacion', -97_280],
      ['loan', 'amortizacion', 97_280],
    ]);
    const book = fold([...ledger, ...out]);
    // Net worth only lost the interest.
    expect(book.cash.get('cash')! + book.cash.get('loan')!).toBe(500_000 - 1_200_000 - 6_000);
  });

  it('pays dividends on the units held, net of both withholdings', () => {
    const buy: Movement = {
      accountId: 'b2',
      day: '2026-04-01',
      seq: 0,
      kind: 'compra',
      amountCents: -60_000,
      instrumentId: 'san',
      qtyE8: toE8(1000),
      priceE8: toE8(6),
      source: 'manual',
    };
    const input: EngineInput = {
      ...none,
      dividends: [
        {
          accountId: 'b2',
          instrumentId: 'san',
          perUnitE8: toE8('0.10'),
          payMonths: [5, 11],
          payDay: 2,
          withholdingOriginBp: 0,
          withholdingEsBp: 1900,
        },
      ],
      market: market({ san: { currency: 'EUR', price: '6' } }),
    };
    const out = advance(input, [buy], '2026-04-30', '2026-11-30');
    expect(out.map((m) => [m.day, m.amountCents, m.withholdingCents])).toEqual([
      ['2026-05-02', 8_100, 1_900],
      ['2026-11-02', 8_100, 1_900],
    ]);
  });

  it('catching up three missed days gives exactly what three daily runs give', () => {
    const t: InterestTerms = {
      tiers: [{ rateBp: 200 }],
      baseDays: 365,
      payFrequency: 'mensual',
      payDay: 1,
      withholdingBp: 1900,
    };
    const input: EngineInput = {
      ...none,
      interest: { rem: t, brk: { ...t, tiers: [{ rateBp: 250 }] } },
      rules: [
        rule({
          id: 't',
          kind: 'transferencia',
          frequency: 'mensual',
          day: 1,
          fromAccountId: 'rem',
          toAccountId: 'brk',
          amountCents: 180_000,
        }),
        rule({
          id: 'p',
          kind: 'plan',
          frequency: 'semanal',
          day: 2,
          startOn: '2026-11-01',
          fromAccountId: 'brk',
          legs: [{ instrumentId: 'world', amountCents: 40_000 }],
        }),
      ],
      market: market({ world: { currency: 'USD', price: '108.50' } }),
    };
    let daily: Movement[] = [opening('rem', 2_000_000), opening('brk', 10_000)];
    for (let d = '2026-10-31'; d < '2027-01-31'; d = addDays(d, 1))
      daily = [...daily, ...advance(input, daily, d, addDays(d, 1))];
    let gaps: Movement[] = [opening('rem', 2_000_000), opening('brk', 10_000)];
    for (const [a, b] of [
      ['2026-10-31', '2026-11-03'],
      ['2026-11-03', '2026-12-20'],
      ['2026-12-20', '2027-01-31'],
    ] as const)
      gaps = [...gaps, ...advance(input, gaps, a, b)];
    const strip = (ms: Movement[]) =>
      ms
        .map((m) => ({ ...m, seq: 0 }))
        .sort((x, y) => (x.occurrenceKey ?? '').localeCompare(y.occurrenceKey ?? ''));
    expect(strip(gaps)).toEqual(strip(daily));
    expect(fold(daily).holdings.get(holdingKey('brk', 'world'))!.qtyE8).toBeGreaterThan(0n);
  });
});

describe('accruedInterest', () => {
  it('counts what is earned and not paid yet, net, and drops to zero the day it is paid', async () => {
    const { accruedInterest } = await import('./advance.ts');
    const t: InterestTerms = {
      tiers: [{ rateBp: 250 }],
      baseDays: 365,
      payFrequency: 'mensual',
      payDay: 31,
      withholdingBp: 1900,
    };
    const input: EngineInput = { ...none, interest: { brk: t } };
    const ledger = [opening('brk', 1_000_000)];
    // 15 days of 0,68493 € are 10,27 € gross: 8,32 € after 19 %.
    expect(accruedInterest(input, ledger, '2026-11-15')).toEqual({ brk: 832 });
    const paid = [...ledger, ...advance(input, ledger, '2026-10-31', '2026-11-30')];
    expect(accruedInterest(input, paid, '2026-11-30')).toEqual({ brk: 0 });
  });
});

describe('plans without enough cash', () => {
  const plan = (extra: Partial<AutoRule>) =>
    rule({
      id: 'p',
      kind: 'plan',
      frequency: 'semanal',
      day: 1,
      startOn: '2026-11-01',
      fromAccountId: 'brk',
      legs: [{ instrumentId: 'world', amountCents: 30_000 }],
      ...extra,
    });
  const priced = { ...none, market: market({ world: { currency: 'EUR', price: '100' } }) };

  it('never takes the broker below zero: the buy is left undone, and only once', () => {
    const input = { ...priced, rules: [plan({})] };
    const ledger = [opening('brk', 50_000)];
    const out = advance(input, ledger, '2026-10-31', '2026-11-09');
    expect(out.map((m) => [m.day, m.kind, m.amountCents, m.qtyE8])).toEqual([
      ['2026-11-02', 'compra', -30_000, toE8(3)],
      ['2026-11-09', 'no_ejecutada', 0, undefined],
    ]);
    expect(fold([...ledger, ...out]).cash.get('brk')).toBe(20_000);
    expect(advance(input, [...ledger, ...out], '2026-10-31', '2026-11-09')).toEqual([]);
  });

  it('or brings the money from the account chosen, then buys', () => {
    const input = {
      ...priced,
      rules: [plan({ shortfall: 'otra_cuenta', shortfallAccountId: 'rem' })],
    };
    const ledger = [opening('brk', 10_000), opening('rem', 100_000)];
    const out = advance(input, ledger, '2026-10-31', '2026-11-02');
    expect(out.map((m) => [m.accountId, m.kind, m.amountCents])).toEqual([
      ['rem', 'transferencia', -30_000],
      ['brk', 'transferencia', 30_000],
      ['brk', 'compra', -30_000],
    ]);
    expect(fold([...ledger, ...out]).cash.get('brk')).toBe(10_000);
  });
});
