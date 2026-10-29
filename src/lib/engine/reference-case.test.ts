// Acceptance test of plan §11.3: the structure of a real user's money, with INVENTED amounts.
// A diesel car from 2013; a savings account at 2 % that sends a fixed amount to the broker at the
// start of each month; a small account paying the self-employed fee; a broker with ETFs in USD
// and EUR, a US stock, a gold ETC, ETH, two private markets, a weekly plan in 6 products and cash
// at 2,5 %; another account with Spanish bank shares paying dividends.
import { describe, expect, it } from 'vitest';
import { type AutoRule, type EngineInput, advance } from './advance.ts';
import { type Day, addDays, daysAfter } from './day.ts';
import { type Holdings, alerts, outsideFlows, valuation } from './insight.ts';
import type { InterestTerms } from './interest.ts';
import { type Movement, fold, holdingKey } from './ledger.ts';
import { market } from './testing.ts';
import { E8, toE8 } from './units.ts';

const START = '2026-10-31';
const END = '2027-04-30';

const prices = market({
  world: { currency: 'USD', price: '108.50' },
  em: { currency: 'EUR', price: '41.20' },
  ai: { currency: 'USD', price: '9.80' },
  gold: { currency: 'USD', price: '43.40' },
  defence: { currency: 'USD', price: '12.10' },
  health: { currency: 'USD', price: '10.70' },
  ttwo: { currency: 'USD', price: '230' },
  eth: { currency: 'EUR', price: '3210.99' },
  san: { currency: 'EUR', price: '8.40' },
  pm1: { currency: 'EUR', price: '1' },
  pm2: { currency: 'EUR', price: '1' },
});

const interest = (rateBp: number): InterestTerms => ({
  tiers: [{ rateBp }],
  baseDays: 365,
  payFrequency: 'mensual',
  payDay: 31,
  withholdingBp: 1900,
});

const rules = (toBrokerCents: number): AutoRule[] => [
  {
    id: 'nomina',
    kind: 'ingreso',
    frequency: 'mensual',
    day: 28,
    startOn: '2026-01-01',
    toAccountId: 'rem',
    amountCents: 210_000,
    legs: [],
    active: true,
  },
  {
    id: 'al-broker',
    kind: 'transferencia',
    frequency: 'mensual',
    day: 1,
    startOn: '2026-01-01',
    fromAccountId: 'rem',
    toAccountId: 'brk',
    amountCents: toBrokerCents,
    legs: [],
    active: true,
  },
  {
    id: 'autonomos',
    kind: 'gasto',
    frequency: 'mensual',
    day: 30,
    startOn: '2026-01-01',
    fromAccountId: 'aut',
    amountCents: 30_000,
    legs: [],
    active: true,
  },
  {
    id: 'plan',
    kind: 'plan',
    frequency: 'semanal',
    day: 1,
    startOn: '2026-11-01',
    fromAccountId: 'brk',
    legs: [
      { instrumentId: 'world', amountCents: 9_000 },
      { instrumentId: 'em', amountCents: 5_000 },
      { instrumentId: 'ai', amountCents: 3_000 },
      { instrumentId: 'gold', amountCents: 3_000 },
      { instrumentId: 'defence', amountCents: 2_500 },
      { instrumentId: 'health', amountCents: 2_500 },
    ],
    active: true,
  },
];

const input = (toBrokerCents = 120_000): EngineInput => ({
  rules: rules(toBrokerCents),
  interest: { rem: interest(200), brk: interest(250) },
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
  debts: {},
  market: prices,
});

const opening: Movement[] = [
  ['rem', 1_500_000],
  ['aut', 100_000],
  ['brk', 200_000],
].map(([accountId, cents]) => ({
  accountId: accountId as string,
  day: START,
  seq: 0,
  kind: 'apertura',
  amountCents: cents as number,
  source: 'migracion',
}));
const lots = (
  account: string,
  instrument: string,
  qty: string,
  price: string,
  cents: number,
  fx = E8,
): Movement => ({
  accountId: account,
  day: '2026-06-01',
  seq: 0,
  kind: 'compra',
  amountCents: -cents,
  instrumentId: instrument,
  qtyE8: toE8(qty),
  priceE8: toE8(price),
  fxE8: fx,
  source: 'manual',
});
// What was already held, bought (and paid from outside) before the start.
const before: Movement[] = [
  {
    accountId: 'brk',
    day: '2026-06-01',
    seq: 0,
    kind: 'apertura',
    amountCents: 2_400_000,
    source: 'migracion',
  },
  lots('brk', 'world', '80', '100', 737_327, toE8('1.085')),
  lots('brk', 'ttwo', '5', '210', 96_774, toE8('1.085')),
  lots('brk', 'eth', '0.25431234', '2800', 71_207),
  lots('brk', 'pm1', '1', '500000', 500_000),
  lots('brk', 'pm2', '1', '300000', 300_000),
  {
    accountId: 'b2',
    day: '2026-06-01',
    seq: 0,
    kind: 'apertura',
    amountCents: 504_000,
    source: 'migracion',
  },
  lots('b2', 'san', '600', '8.40', 504_000),
];

const holdings: Holdings = {
  accounts: [
    { id: 'coche', kind: 'vehiculo' },
    { id: 'rem', kind: 'remunerada' },
    { id: 'aut', kind: 'efectivo' },
    { id: 'brk', kind: 'broker' },
    { id: 'b2', kind: 'broker' },
  ],
  instruments: {
    world: { kind: 'etf' },
    em: { kind: 'etf' },
    ai: { kind: 'etf' },
    gold: { kind: 'etc' },
    defence: { kind: 'etf' },
    health: { kind: 'etf' },
    ttwo: { kind: 'accion' },
    eth: { kind: 'cripto' },
    san: { kind: 'accion' },
    pm1: { kind: 'estimado' },
    pm2: { kind: 'estimado' },
  },
  estimates: { 'brk|pm1': 900, 'brk|pm2': 700 },
  vehicles: {
    coche: {
      baseCents: 1_800_000,
      table: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((y, i) => ({
        yearsOver: y,
        pctBp: [10000, 8400, 6700, 5600, 4700, 3900, 3400, 2800, 2400, 1900, 1700, 1300, 1000][i]!,
      })),
      firstRegistration: '2013-03-15',
    },
  },
  assets: {},
  market: prices,
};

// The whole period, one day at a time, as the daily cron would.
function daily(i: EngineInput) {
  let ledger = [...before, ...opening];
  for (let d = START; d < END; d = addDays(d, 1))
    ledger = [...ledger, ...advance(i, ledger, d, addDays(d, 1))];
  return ledger;
}

describe('reference case', () => {
  const ledger = daily(input());

  it('gives the same ledger when the cron misses days and catches up', () => {
    let gaps = [...before, ...opening];
    for (const [a, b] of [
      [START, '2026-11-04'],
      ['2026-11-04', '2027-01-15'],
      ['2027-01-15', END],
    ] as const)
      gaps = [...gaps, ...advance(input(), gaps, a, b)];
    const keys = (ms: Movement[]) =>
      ms.map((m) => `${m.occurrenceKey}|${m.amountCents}|${m.qtyE8}`).sort();
    expect(keys(gaps)).toEqual(keys(ledger));
    // And running again generates nothing.
    expect(advance(input(), ledger, START, END)).toEqual([]);
  });

  it('pays the broker’s cash interest on the real daily balance while the plan spends it', () => {
    const paid = ledger.filter((m) => m.accountId === 'brk' && m.kind === 'interes');
    expect(paid.map((m) => m.day)).toEqual([
      '2026-11-30',
      '2026-12-31',
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ]);
    // Independent check: 2,5 % / 365 on each day's closing balance, summed per month.
    let month = START.slice(0, 7);
    let sum = 0;
    const expected: number[] = [];
    for (const d of daysAfter(START, END)) {
      if (d.slice(0, 7) !== month) month = d.slice(0, 7);
      const closing = fold(
        ledger.filter((m) => !(m.kind === 'interes' && m.accountId === 'brk' && m.day === d)),
        d,
      ).cash.get('brk')!;
      sum += (closing * 0.025) / 365;
      if (paid.some((p) => p.day === d)) {
        expected.push(Math.floor(sum + 1e-9));
        sum = 0;
      }
    }
    expect(paid.map((m) => m.amountCents + m.withholdingCents!)).toEqual(expected);
    // Interest on the starting balance alone would be another number: the plan spends it.
    const naive = Math.floor((200_000 * 0.025 * 30) / 365);
    expect(paid[0]!.amountCents + paid[0]!.withholdingCents!).not.toBe(naive);
    expect(
      paid.every(
        (m) =>
          m.withholdingCents === Math.round(((m.amountCents + m.withholdingCents!) * 19) / 100),
      ),
    ).toBe(true);
  });

  it('warns when the weekly plan (×52/12) spends more than the monthly transfer brings', () => {
    // 250 € a week are 1.083,33 € a month: covered by 1.200 €, not by 1.000 €.
    const keys = (i: EngineInput) =>
      alerts(i, holdings, [...before, ...opening], START).map((a) => a.key);
    expect(keys(input(120_000))).not.toContain('plan_supera:plan');
    expect(keys(input(100_000))).toContain('plan_supera:plan');
    // The small account pays 300 € on the 30th from 1.000 €: 700, 400, 100 and, on 28 February
    // (the 30th of a short month), −200 €. It says when.
    expect(
      alerts(input(), holdings, ledger, '2027-01-31').find((a) => a.key === 'sin_saldo:aut')?.day,
    ).toBe('2027-02-28');
  });

  it('values everything in euros: USD at the ECB rate, ETH to 8 decimals, estimates, the 2013 car', () => {
    const v = valuation(holdings, ledger, END);
    const held = fold(ledger, END).holdings;
    const world = held.get(holdingKey('brk', 'world'))!.qtyE8;
    expect(world % E8).not.toBe(0n);
    const eth = held.get(holdingKey('brk', 'eth'))!.qtyE8;
    expect(eth).toBe(toE8('0.25431234'));
    // A 2013 diesel is past 12 years: 10 % of its (invented) Anexo I value.
    expect(v.byAccount.coche).toBe(180_000);
    expect(v.byClass.oro).toBeGreaterThan(0);
    expect(v.byClass.cripto).toBe(Math.round(0.25431234 * 3210.99 * 100));
    expect(v.byClass.deudas).toBe(0);
    expect(v.total).toBe(Object.values(v.byAccount).reduce((s, c) => s + c, 0));
  });

  it('pays the bank’s dividends with 19 % withheld, on the shares held', () => {
    expect(
      ledger
        .filter((m) => m.kind === 'dividendo')
        .map((m) => [m.day, m.amountCents, m.withholdingCents]),
    ).toEqual([['2026-11-02', 4_860, 1_140]]);
  });

  it('a transfer between own accounts never changes net worth', () => {
    // 1 December 2026: only the transfer to the broker happens (prices are flat in this test).
    const day: Day = '2026-12-01';
    const moves = ledger.filter((m) => m.day === day);
    expect(moves.map((m) => m.kind)).toEqual(['transferencia', 'transferencia']);
    const made =
      valuation(holdings, ledger, day).total -
      valuation(holdings, ledger, addDays(day, -1)).total -
      outsideFlows(ledger, addDays(day, -1), day).reduce((s, m) => s + m.amountCents, 0);
    // Only the estimates grew a day.
    const estimatesGrew =
      valuation(holdings, ledger, day).byClass.renta_variable -
      valuation(holdings, ledger, addDays(day, -1)).byClass.renta_variable;
    expect(made).toBe(estimatesGrew);
  });
});
