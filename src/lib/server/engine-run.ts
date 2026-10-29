import { type AutoRule, type EngineInput, type Market, advance } from '#lib/engine/advance.ts';
import { type Day, addDays, daysAfter, monthOf } from '#lib/engine/day.ts';
import type { DebtTerms } from '#lib/engine/debt.ts';
import {
  type AccountKind,
  type Holdings,
  type InstrumentKind,
  alerts,
  outsideFlows,
  valuation,
} from '#lib/engine/insight.ts';
import type { InterestTerms } from '#lib/engine/interest.ts';
import { type Movement, fold } from '#lib/engine/ledger.ts';
import { reprice } from '#lib/engine/reconcile.ts';
import { E8 } from '#lib/engine/units.ts';
import type { Db } from './db/index.ts';

const big = (v: unknown) => (v === null || v === undefined ? undefined : BigInt(v as string));
const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));

// Everything the engine needs about one user, read once inside the run's transaction.
export async function loadUser(tx: Db, userId: string) {
  const accounts = await tx.query<{ id: string; kind: AccountKind }>(
    `select a.id, a.kind from money_account a join account_access x on x.account_id = a.id
     where x.user_id = $1 and x.role = 'propietario' order by a.created_at, a.id`,
    [userId],
  );
  const ids = accounts.map((a) => a.id);
  const rows = await tx.query(
    `select id, account_id, day::text as day, seq, kind, amount_cents::text as amount, instrument_id,
       qty_e8::text as qty, price_e8::text as price, fx_e8::text as fx, fee_cents::text as fee,
       withholding_cents::text as withheld, transfer_id, source, rule_id, occurrence_key,
       provisional, voided_at is not null as voided
     from movement where account_id = any($1) order by day, seq, created_at, id`,
    [ids],
  );
  const ledger = rows.map((r): Movement & { id: string } => ({
    id: r.id as string,
    accountId: r.account_id as string,
    day: r.day as string,
    seq: r.seq as number,
    kind: r.kind as Movement['kind'],
    amountCents: Number(r.amount),
    instrumentId: (r.instrument_id as string) ?? undefined,
    qtyE8: big(r.qty),
    priceE8: big(r.price),
    fxE8: big(r.fx),
    feeCents: num(r.fee),
    withholdingCents: num(r.withheld),
    transferId: (r.transfer_id as string) ?? undefined,
    source: r.source as Movement['source'],
    ruleId: (r.rule_id as string) ?? undefined,
    occurrenceKey: (r.occurrence_key as string) ?? undefined,
    provisional: r.provisional as boolean,
    voided: r.voided as boolean,
  }));

  const ruleRows = await tx.query(
    `select r.id, r.kind, r.frequency, r.day, r.start_on::text as start_on, r.end_on::text as end_on,
       r.from_account_id, r.to_account_id, r.amount_cents::text as amount, r.active,
       coalesce(json_agg(json_build_object('instrumentId', l.instrument_id, 'amountCents', l.amount_cents)
         order by l.seq) filter (where l.rule_id is not null), '[]') as legs
     from auto_rule r left join auto_rule_leg l on l.rule_id = r.id
     where r.user_id = $1 group by r.id order by r.created_at, r.id`,
    [userId],
  );
  const rules = ruleRows.map((r): AutoRule => ({
    id: r.id as string,
    kind: r.kind as AutoRule['kind'],
    frequency: r.frequency as AutoRule['frequency'],
    day: (r.day as number) ?? undefined,
    startOn: r.start_on as string,
    endOn: (r.end_on as string) ?? undefined,
    fromAccountId: (r.from_account_id as string) ?? undefined,
    toAccountId: (r.to_account_id as string) ?? undefined,
    amountCents: num(r.amount),
    legs: (r.legs as { instrumentId: string; amountCents: number | string }[]).map((l) => ({
      instrumentId: l.instrumentId,
      amountCents: Number(l.amountCents),
    })),
    active: r.active as boolean,
  }));

  const interest: Record<string, InterestTerms> = {};
  for (const r of await tx.query(
    `select c.account_id, c.base_days, c.pay_frequency, c.pay_day, c.promo_until::text as promo_until,
       c.after_rate_bp, c.withholding_bp,
       coalesce(json_agg(json_build_object('upToCents', t.up_to_cents, 'rateBp', t.rate_bp)
         order by t.up_to_cents nulls last) filter (where t.account_id is not null), '[]') as tiers
     from interest_config c left join interest_tier t on t.account_id = c.account_id
     where c.account_id = any($1) group by c.account_id`,
    [ids],
  ))
    interest[r.account_id as string] = {
      baseDays: r.base_days as 360 | 365,
      payFrequency: r.pay_frequency as InterestTerms['payFrequency'],
      payDay: r.pay_day as number,
      promoUntil: (r.promo_until as string) ?? undefined,
      afterRateBp: (r.after_rate_bp as number) ?? undefined,
      withholdingBp: r.withholding_bp as number,
      tiers: (r.tiers as { upToCents: number | string | null; rateBp: number }[]).map((t) => ({
        upToCents: t.upToCents === null ? undefined : Number(t.upToCents),
        rateBp: t.rateBp,
      })),
    };

  const dividends = (
    await tx.query(
      `select account_id, instrument_id, per_unit_e8::text as per, pay_months, pay_day,
         withholding_origin_bp, withholding_es_bp
       from dividend_config where account_id = any($1)`,
      [ids],
    )
  ).map((r) => ({
    accountId: r.account_id as string,
    instrumentId: r.instrument_id as string,
    perUnitE8: BigInt(r.per as string),
    payMonths: (r.pay_months as number[]).map(Number),
    payDay: r.pay_day as number,
    withholdingOriginBp: r.withholding_origin_bp as number,
    withholdingEsBp: r.withholding_es_bp as number,
  }));

  const index: Record<string, number> = {};
  for (const r of await tx.query(
    `select to_char(month, 'YYYY-MM') as m, rate_bp::float8 as v from index_rate where index = 'euribor_12m'`,
  ))
    index[r.m as string] = r.v as number;
  const debts: Record<string, DebtTerms & { payerAccountId?: string }> = {};
  for (const r of await tx.query(
    `select account_id, principal_cents::text as principal, start_on::text as start_on,
       first_payment_on::text as first, term_months, rate_type, initial_rate_bp, spread_bp,
       review_months, floor_bp, payer_account_id
     from debt where account_id = any($1)`,
    [ids],
  ))
    debts[r.account_id as string] = {
      principalCents: Number(r.principal),
      startOn: r.start_on as string,
      firstPaymentOn: r.first as string,
      termMonths: r.term_months as number,
      rateType: r.rate_type as 'fijo' | 'variable',
      initialRateBp: r.initial_rate_bp as number,
      index,
      spreadBp: (r.spread_bp as number) ?? undefined,
      reviewMonths: (r.review_months as number) ?? undefined,
      floorBp: (r.floor_bp as number) ?? undefined,
      payerAccountId: (r.payer_account_id as string) ?? undefined,
    };

  // Instruments in play: held, moved or bought by a plan.
  const used = new Set([
    ...ledger.flatMap((m) => (m.instrumentId ? [m.instrumentId] : [])),
    ...rules.flatMap((r) => r.legs.map((l) => l.instrumentId)),
    ...dividends.map((d) => d.instrumentId),
  ]);
  const instruments: Record<string, { kind: InstrumentKind; currency: string }> = {};
  for (const r of await tx.query<{ id: string; kind: InstrumentKind; currency: string }>(
    `select id, kind, currency from instrument where id = any($1)`,
    [[...used]],
  ))
    instruments[r.id] = { kind: r.kind, currency: r.currency };

  const prices = new Map<string, { day: Day; priceE8: bigint }[]>();
  for (const r of await tx.query(
    `select instrument_id, day::text as day, close_e8::text as close from (
       select instrument_id, day, close_e8, 0 as own from price where instrument_id = any($1)
       union all
       select instrument_id, day, close_e8, 1 from price_override where user_id = $2 and instrument_id = any($1)
     ) p order by instrument_id, day, own`,
    [[...used], userId],
  )) {
    const list = prices.get(r.instrument_id as string) ?? [];
    // The user's own price of a day replaces the provider's (it comes after it).
    if (list.at(-1)?.day === r.day) list.pop();
    list.push({ day: r.day as string, priceE8: BigInt(r.close as string) });
    prices.set(r.instrument_id as string, list);
  }
  const currencies = [...new Set(Object.values(instruments).map((i) => i.currency))].filter(
    (c) => c !== 'EUR',
  );
  const rates = new Map<string, { day: Day; priceE8: bigint }[]>();
  for (const r of await tx.query(
    `select currency, day::text as day, per_eur_e8::text as v from fx_rate where currency = any($1) order by currency, day`,
    [currencies],
  ))
    rates.set(r.currency as string, [
      ...(rates.get(r.currency as string) ?? []),
      { day: r.day as string, priceE8: BigInt(r.v as string) },
    ]);

  const market: Market = {
    currency: (id) => instruments[id]?.currency ?? 'EUR',
    close: (id, day) => latest(prices.get(id), day),
    perEur: (c, day) => (c === 'EUR' ? E8 : latest(rates.get(c), day)?.priceE8),
  };

  const estimates: Record<string, number> = {};
  for (const r of await tx.query(
    `select account_id || '|' || instrument_id as k, annual_rate_bp from estimate_config where account_id = any($1)`,
    [ids],
  ))
    estimates[r.k as string] = r.annual_rate_bp as number;
  const vehicles: Holdings['vehicles'] = {};
  for (const r of await tx.query(
    `select v.account_id, b.value_cents::text as base, b.order_year, v.first_registration::text as reg,
       v.override_cents::text as override,
       (select json_agg(json_build_object('yearsOver', d.years_over, 'pctBp', d.pct_bp))
          from vehicle_depreciation d where d.order_year = b.order_year) as table
     from vehicle v left join vehicle_base b on b.id = v.vehicle_base_id where v.account_id = any($1)`,
    [ids],
  ))
    vehicles[r.account_id as string] = {
      baseCents: num(r.base),
      table: (r.table as { yearsOver: number; pctBp: number }[] | null) ?? [
        { yearsOver: 0, pctBp: 10_000 },
      ],
      firstRegistration: r.reg as string,
      overrideCents: num(r.override),
    };
  const assets: Holdings['assets'] = {};
  for (const r of await tx.query(
    `select a.account_id, a.purchase_cents::text as price, a.purchased_on::text as on,
       (select json_agg(json_build_object('years', c.years, 'pctBp', c.pct_bp)) from asset_curve c
        where c.category = a.category) as curve
     from asset a where a.account_id = any($1)`,
    [ids],
  ))
    assets[r.account_id as string] = {
      purchaseCents: Number(r.price),
      purchasedOn: r.on as string,
      curve: (r.curve as { years: number; pctBp: number }[]) ?? [],
    };

  const input: EngineInput = { rules, interest, dividends, debts, market };
  const holdings: Holdings = { accounts, instruments, estimates, vehicles, assets, market };
  return { ledger, input, holdings };
}

function latest(list: { day: Day; priceE8: bigint }[] | undefined, day: Day) {
  if (!list?.length || list[0]!.day > day) return undefined;
  let [lo, hi] = [0, list.length - 1];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (list[mid]!.day <= day) lo = mid;
    else hi = mid - 1;
  }
  return list[lo];
}

// One user's run, alone (advisory lock) and all or nothing: generate what is owed up to `today`,
// reprice the buys whose close is out, rebuild the holdings cache, keep the daily and monthly
// history and refresh the alerts. Users not on the ledger yet (before the cut-over) are skipped.
export async function runUser(db: Db, userId: string, today: Day) {
  return db.transaction(async (tx) => {
    await tx.query(`select pg_advisory_xact_lock(hashtext($1))`, [userId]);
    const [state] = await tx.query<{ through: string }>(
      `select processed_through::text as through from engine_state where user_id = $1`,
      [userId],
    );
    if (!state) return null;
    const { ledger, input, holdings } = await loadUser(tx, userId);
    const from = state.through < today ? state.through : today;

    const fresh = advance(input, ledger, from, today);
    for (const m of fresh)
      await tx.query(
        `insert into movement (account_id, day, seq, kind, amount_cents, instrument_id, qty_e8, price_e8,
           fx_e8, withholding_cents, transfer_id, source, rule_id, occurrence_key, provisional)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         on conflict (occurrence_key) where occurrence_key is not null do nothing`,
        [
          m.accountId,
          m.day,
          m.seq,
          m.kind,
          m.amountCents,
          m.instrumentId ?? null,
          m.qtyE8?.toString() ?? null,
          m.priceE8?.toString() ?? null,
          m.fxE8?.toString() ?? null,
          m.withholdingCents ?? 0,
          m.transferId ?? null,
          m.source,
          m.ruleId ?? null,
          m.occurrenceKey ?? null,
          m.provisional ?? false,
        ],
      );

    // Provisional buys whose own day's close is now published.
    let repriced = 0;
    for (const m of ledger.filter((m) => m.provisional && !m.voided)) {
      const q = input.market.close(m.instrumentId!, m.day);
      const fx = input.market.perEur(input.market.currency(m.instrumentId!), m.day);
      if (q?.day !== m.day || !fx) continue;
      const r = reprice(m, q.priceE8, fx);
      await tx.query(
        `update movement set price_e8 = $2, fx_e8 = $3, qty_e8 = $4, provisional = false where id = $1`,
        [m.id, r.priceE8!.toString(), r.fxE8!.toString(), r.qtyE8!.toString()],
      );
      Object.assign(m, r);
      repriced++;
    }

    const all = [...ledger, ...fresh];
    const ids = holdings.accounts.map((a) => a.id);
    await tx.query(`delete from position where account_id = any($1)`, [ids]);
    for (const [key, h] of fold(all).holdings) {
      if (h.qtyE8 <= 0n) continue;
      const [account, instrument] = key.split('|');
      await tx.query(
        `insert into position (account_id, instrument_id, qty_e8, cost_cents) values ($1, $2, $3, $4)`,
        [account, instrument, h.qtyE8.toString(), Math.max(0, h.costCents)],
      );
    }

    // History: today's value always (prices move), and each day the run went through.
    for (const d of new Set([...daysAfter(from, today), today])) {
      const v = valuation(holdings, all, d);
      const flows = outsideFlows(all, addDays(d, -1), d).reduce((s, m) => s + m.amountCents, 0);
      await tx.query(
        `insert into user_day (user_id, day, total_cents, flows_cents) values ($1, $2, $3, $4)
         on conflict (user_id, day) do update set total_cents = excluded.total_cents, flows_cents = excluded.flows_cents`,
        [userId, d, v.total, flows],
      );
      if (monthOf(addDays(d, 1)) !== monthOf(d) || d === today)
        for (const [account, value] of Object.entries(v.byAccount)) {
          const own = all.filter((m) => m.accountId === account);
          const monthFlows = outsideFlows(own, addDays(`${monthOf(d)}-01`, -1), d).reduce(
            (s, m) => s + m.amountCents,
            0,
          );
          await tx.query(
            `insert into account_month (account_id, month, value_cents, flows_cents) values ($1, $2, $3, $4)
             on conflict (account_id, month) do update set value_cents = excluded.value_cents, flows_cents = excluded.flows_cents`,
            [account, `${monthOf(d)}-01`, value, monthFlows],
          );
        }
    }

    const found = alerts(input, holdings, all, today);
    for (const a of found)
      await tx.query(
        `insert into alert (user_id, kind, account_id, instrument_id, day, dedupe_key) values ($1, $2, $3, $4, $5, $6)
         on conflict (user_id, dedupe_key) do update set day = excluded.day,
           state = case when alert.state = 'resuelta' then 'abierta' else alert.state end`,
        [userId, a.kind, a.accountId ?? null, a.instrumentId ?? null, a.day, a.key],
      );
    await tx.query(
      `update alert set state = 'resuelta' where user_id = $1 and state <> 'resuelta' and not (dedupe_key = any($2))`,
      [userId, found.map((a) => a.key)],
    );
    await tx.query(
      `update engine_state set processed_through = $2, updated_at = now() where user_id = $1`,
      [userId, today],
    );
    return { generated: fresh.length, repriced, alerts: found.length };
  });
}
