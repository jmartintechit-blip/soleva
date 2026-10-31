import { interestSince } from '#lib/engine/advance.ts';
import { type Day, addDays } from '#lib/engine/day.ts';
import { type InterestTerms, isPayDay, payment } from '#lib/engine/interest.ts';
import type { Movement } from '#lib/engine/ledger.ts';
import { parseEuros, parsePercent } from '#lib/engine/money.ts';
import { MAX_CENTS } from './accounts.ts';
import type { Db } from './db/index.ts';

// RRemunerada (b12): the terms of an account's interest as the bank gives them, and what they
// make this period on each day's real balance (the engine's own replay, so it is what it pays).

export const PAY_FREQUENCIES = ['mensual', 'trimestral', 'semestral', 'anual'] as const;
export const TERM_KINDS = ['remunerada', 'efectivo', 'broker'];

export interface TermsInput {
  tiers: { upToCents: number | null; rateBp: number }[];
  promoUntil: Day | null;
  afterRateBp: number | null;
  payFrequency: (typeof PAY_FREQUENCIES)[number];
  payDay: number;
  baseDays: 360 | 365;
  withholdingBp: number;
}

// Monthly, on the daily balance, 19 % withheld: the usual ones, until the user says otherwise.
const DEFAULTS: TermsInput = {
  tiers: [{ upToCents: null, rateBp: 0 }],
  promoUntil: null,
  afterRateBp: null,
  payFrequency: 'mensual',
  payDay: 31,
  baseDays: 365,
  withholdingBp: 1900,
};

const engineTerms = (t: TermsInput): InterestTerms => ({
  tiers: t.tiers.map((x) => ({ upToCents: x.upToCents ?? undefined, rateBp: x.rateBp })),
  baseDays: t.baseDays,
  payFrequency: t.payFrequency,
  payDay: t.payDay,
  promoUntil: t.promoUntil ?? undefined,
  afterRateBp: t.afterRateBp ?? undefined,
  withholdingBp: t.withholdingBp,
});

// The account's terms and this period's interest up to `today`; null unless the user can see it
// and it is an account that can earn interest.
export async function termsView(db: Db, userId: string, accountId: string, today: Day) {
  const [a] = await db.query<{ id: string; name: string; kind: string; role: string; j: string }>(
    `select a.id, a.name, a.kind, x.role,
            (select json_build_object('baseDays', c.base_days, 'payFrequency', c.pay_frequency,
                'payDay', c.pay_day, 'promoUntil', c.promo_until, 'afterRateBp', c.after_rate_bp,
                'withholdingBp', c.withholding_bp,
                'tiers', (select json_agg(json_build_object('upToCents', t.up_to_cents::float8,
                            'rateBp', t.rate_bp) order by t.up_to_cents nulls last)
                          from interest_tier t where t.account_id = c.account_id))
             from interest_config c where c.account_id = a.id)::text as j
     from money_account a join account_access x on x.account_id = a.id and x.user_id = $1
     where a.id = $2`,
    [userId, accountId],
  );
  if (!a || !TERM_KINDS.includes(a.kind)) return null;
  const terms: TermsInput = a.j ? { ...DEFAULTS, ...JSON.parse(a.j) } : DEFAULTS;
  const t = engineTerms(terms);
  const ledger = await db.query<Movement & Record<string, unknown>>(
    `select account_id as "accountId", day::text as day, seq, kind,
            amount_cents::float8 as "amountCents", withholding_cents::float8 as "withholdingCents"
     from movement where account_id = $1 and voided_at is null and day <= $2 order by day, seq`,
    [accountId, today],
  );
  // The period: after the last pay day (on it too when nothing was paid that day: the account
  // opened then) up to today; on a pay day, the one it closes.
  let start = isPayDay(t, today) ? addDays(today, -1) : today;
  for (let k = 0; k < 366 && !isPayDay(t, start); k++) start = addDays(start, -1);
  const paid = (d: Day) => ledger.find((m) => m.kind === 'interes' && m.day === d);
  let first = paid(start) ? addDays(start, 1) : start;
  // Not before the account had anything.
  if (ledger[0] && first < ledger[0].day) first = ledger[0].day;
  let payOn = today;
  for (let k = 0; k < 400 && !isPayDay(t, payOn); k++) payOn = addDays(payOn, 1);
  let balance = ledger.filter((m) => m.day < first).reduce((s, m) => s + m.amountCents, 0);
  let days = 0;
  let sum = 0;
  for (let d = first; d <= today; d = addDays(d, 1)) {
    for (const m of ledger)
      if (m.day === d && !(m.kind === 'interes' && d === today)) balance += m.amountCents;
    sum += balance;
    days++;
  }
  const today_ = paid(today);
  const { gross, withheld, net } = today_
    ? {
        gross: today_.amountCents + (today_.withholdingCents ?? 0),
        withheld: today_.withholdingCents ?? 0,
        net: today_.amountCents,
      }
    : payment(
        interestSince(
          { rules: [], interest: { [accountId]: t }, dividends: [], debts: {}, market: undefined! },
          ledger,
          today,
        )[accountId] ?? 0n,
        t,
      );
  return {
    account: { id: a.id, name: a.name, kind: a.kind, cents: balance + (today_?.amountCents ?? 0) },
    terms,
    period: { from: first, to: today, gross, withheld, net, payOn },
    averageCents: days ? Math.round(sum / days) : balance,
    canEdit: a.role === 'propietario' || a.role === 'editor',
  };
}

// RRemunerada's form: the tiers (Hasta … € at … %, the last one with no limit), the promotion
// and what comes after it, how it pays, the base and the withholding.
export function readTermsForm(form: FormData) {
  const one = (k: string) => String(form.get(k) ?? '').trim();
  const upTo = form.getAll('tier_upto').map((v) => String(v).trim());
  const rate = form.getAll('tier_rate').map((v) => String(v).trim());
  const values = {
    tiers: upTo.map((u, i) => ({ upTo: u, rate: rate[i] ?? '' })),
    promo: one('promo'),
    promoUntil: one('promo_until'),
    afterRate: one('after_rate'),
    payFrequency: one('pay_frequency'),
    payDay: one('pay_day'),
    baseDays: one('base_days'),
    withholding: one('withholding'),
  };
  const errors: Record<string, string> = {};
  const tiers = values.tiers.map((x, i) => ({
    upToCents: i === values.tiers.length - 1 || !x.upTo ? null : parseEuros(x.upTo),
    rateBp: parsePercent(x.rate),
  }));
  if (!tiers.length || tiers.length > 5) errors.tiers = 'Entre 1 y 5 tramos';
  else if (tiers.some((x) => x.rateBp === null || x.rateBp < 0 || x.rateBp > 10_000))
    errors.tiers = 'Escribe el interés de cada tramo, por ejemplo 2';
  else if (
    tiers.slice(0, -1).some((x, i, all) => {
      const c = x.upToCents;
      return !c || c <= 0 || c > MAX_CENTS || (i > 0 && c <= all[i - 1]!.upToCents!);
    })
  )
    errors.tiers = 'Cada tramo llega más alto que el anterior';
  const promo = !!values.promo;
  const after = promo ? parsePercent(values.afterRate) : null;
  if (promo && !/^\d{4}-\d{2}-\d{2}$/.test(values.promoUntil))
    errors.promo = 'Elige hasta cuándo dura la promoción';
  else if (promo && (after === null || after < 0 || after > 10_000))
    errors.promo = 'Escribe el interés de después, por ejemplo 0,5';
  const payFrequency = PAY_FREQUENCIES.find((f) => f === values.payFrequency);
  const payDay = Number(values.payDay);
  if (!payFrequency || !Number.isInteger(payDay) || payDay < 1 || payDay > 31)
    errors.pay = 'Elige cuándo paga';
  const withholding = parsePercent(values.withholding);
  if (withholding === null || withholding < 0 || withholding > 10_000)
    errors.withholding = 'Escribe la retención, por ejemplo 19';
  if (Object.keys(errors).length) return { ok: false as const, values, errors };
  return {
    ok: true as const,
    values,
    input: {
      tiers: tiers.map((x) => ({ upToCents: x.upToCents, rateBp: x.rateBp! })),
      promoUntil: promo ? values.promoUntil : null,
      afterRateBp: after,
      payFrequency: payFrequency!,
      payDay,
      baseDays: values.baseDays === '360' ? 360 : 365,
      withholdingBp: withholding!,
    } satisfies TermsInput,
  };
}

// Saves the terms; null unless the user can change that account. From the day saved, the engine
// accrues by them (this period included); what was paid stays.
export async function saveTerms(db: Db, userId: string, accountId: string, t: TermsInput) {
  const [ok] = await db.query(
    `select 1 from money_account a join account_access x on x.account_id = a.id and x.user_id = $2
       and x.role in ('propietario', 'editor')
     where a.id = $1 and a.kind = any($3)`,
    [accountId, userId, TERM_KINDS],
  );
  if (!ok) return null;
  await db.transaction(async (tx) => {
    await tx.query(
      `insert into interest_config (account_id, base_days, pay_frequency, pay_day, promo_until,
         after_rate_bp, withholding_bp)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (account_id) do update set base_days = excluded.base_days,
         pay_frequency = excluded.pay_frequency, pay_day = excluded.pay_day,
         promo_until = excluded.promo_until, after_rate_bp = excluded.after_rate_bp,
         withholding_bp = excluded.withholding_bp`,
      [
        accountId,
        t.baseDays,
        t.payFrequency,
        t.payDay,
        t.promoUntil,
        t.afterRateBp,
        t.withholdingBp,
      ],
    );
    await tx.query(`delete from interest_tier where account_id = $1`, [accountId]);
    await tx.query(
      `insert into interest_tier (account_id, up_to_cents, rate_bp)
       select $1, * from unnest($2::bigint[], $3::int[])`,
      [accountId, t.tiers.map((x) => x.upToCents), t.tiers.map((x) => x.rateBp)],
    );
  });
  return true;
}
