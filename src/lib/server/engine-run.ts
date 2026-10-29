import { type AutoRule, type EngineInput, type Market, advance } from '#lib/engine/advance.ts';
import { type Day, addDays, daysAfter, monthOf } from '#lib/engine/day.ts';
import type { DebtTerms } from '#lib/engine/debt.ts';
import {
  type AccountKind,
  type Holdings,
  type Forecast,
  type InstrumentKind,
  alerts,
  outsideFlows,
  valuation,
} from '#lib/engine/insight.ts';
import type { InterestTerms } from '#lib/engine/interest.ts';
import { isPayDay } from '#lib/engine/interest.ts';
import { type Movement, fold, holdingKey } from '#lib/engine/ledger.ts';
import { reprice } from '#lib/engine/reconcile.ts';
import { E8 } from '#lib/engine/units.ts';
import type { Db } from './db/index.ts';

const big = (v: unknown) => (v === null || v === undefined ? undefined : BigInt(v as string));
const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));

// One query, one JSON text: the driver's per-row work was most of a run's CPU in Workers.
async function movements(tx: Db, where: string, params: unknown[]) {
  const [r] = await tx.query<{ j: string }>(
    `select coalesce(json_agg(json_build_array(m.id, m.account_id, m.day, m.seq, m.kind,
       m.amount_cents::text, m.instrument_id, m.qty_e8::text, m.price_e8::text, m.fx_e8::text,
       m.withholding_cents::text, m.transfer_id, m.source, m.rule_id, m.occurrence_key,
       m.provisional, m.voided_at is not null) order by m.day, m.seq, m.created_at, m.id), '[]')::text as j
     from movement m where ${where}`,
    params,
  );
  type Raw = [
    string,
    string,
    string,
    number,
    Movement['kind'],
    string,
    string | null,
    string | null,
    string | null,
    string | null,
    string,
    string | null,
    Movement['source'],
    string | null,
    string | null,
    boolean,
    boolean,
  ];
  return (JSON.parse(r!.j) as Raw[]).map((x): Movement & { id: string } => ({
    id: x[0],
    accountId: x[1],
    day: x[2],
    seq: x[3],
    kind: x[4],
    amountCents: Number(x[5]),
    instrumentId: x[6] ?? undefined,
    qtyE8: big(x[7]),
    priceE8: big(x[8]),
    fxE8: big(x[9]),
    withholdingCents: Number(x[10]),
    transferId: x[11] ?? undefined,
    source: x[12],
    ruleId: x[13] ?? undefined,
    occurrenceKey: x[14] ?? undefined,
    provisional: x[15],
    voided: x[16],
  }));
}

const NOT_ESTIMATE = `not exists (select 1 from instrument i where i.id = m.instrument_id and i.kind = 'estimado')`;

// The ledger a run needs. Whole, or (given `from`, when nothing was changed by hand since the last
// run) compacted: each account's cash as one opening at the window start (the last interest
// payment or the month start, whichever is earlier), the window's movements (units stripped up to
// `from`), the holdings of the cache as stand-ins on `from`, and estimates whole (their value is
// their contributions). The same results from a few hundred rows instead of years.
async function loadLedger(
  tx: Db,
  ids: string[],
  interest: Record<string, InterestTerms>,
  from?: Day,
) {
  if (!from) {
    const ledger = await movements(tx, `m.account_id = any($1)`, [ids]);
    return {
      ledger,
      provisional: ledger.filter((m) => m.provisional && !m.voided),
      standIns: new Map<string, Movement>(),
    };
  }
  let start = addDays(`${monthOf(from)}-01`, -1);
  for (const t of Object.values(interest)) {
    let d = from;
    for (let k = 0; k < 366 && !isPayDay(t, d); k++) d = addDays(d, -1);
    if (d < start) start = d;
  }
  const openings = (
    await tx.query<{ account_id: string; cash: string }>(
      `select m.account_id, sum(m.amount_cents)::text as cash from movement m
       where m.account_id = any($1) and m.day <= $2 and m.voided_at is null and ${NOT_ESTIMATE}
       group by m.account_id`,
      [ids, start],
    )
  ).map((r): Movement => ({
    accountId: r.account_id,
    day: start,
    seq: -1,
    kind: 'apertura',
    amountCents: Number(r.cash),
    source: 'motor',
  }));
  const window = await movements(tx, `m.account_id = any($1) and m.day > $2 and ${NOT_ESTIMATE}`, [
    ids,
    start,
  ]);
  const estimates = await movements(tx, `m.account_id = any($1) and not ${NOT_ESTIMATE}`, [ids]);
  const standIns = new Map<string, Movement>();
  const neutral: Movement[] = [];
  for (const p of await tx.query<{
    account_id: string;
    instrument_id: string;
    qty: string;
    cost: string;
  }>(
    `select p.account_id, p.instrument_id, p.qty_e8::text as qty, p.cost_cents::text as cost
     from position p join instrument i on i.id = p.instrument_id
     where p.account_id = any($1) and i.kind <> 'estimado'`,
    [ids],
  )) {
    const cost = Number(p.cost);
    // A buy of what the cache holds, with its cost, and the cash it took given back.
    standIns.set(holdingKey(p.account_id, p.instrument_id), {
      accountId: p.account_id,
      day: from,
      seq: -1,
      kind: 'compra',
      amountCents: -cost,
      instrumentId: p.instrument_id,
      qtyE8: BigInt(p.qty),
      priceE8: 1n,
      source: 'motor',
    });
    neutral.push({
      accountId: p.account_id,
      day: from,
      seq: -1,
      kind: 'apertura',
      amountCents: cost,
      source: 'motor',
    });
  }
  const stripped = window.map((m) =>
    m.day <= from && m.qtyE8 !== undefined
      ? { ...m, instrumentId: undefined, qtyE8: undefined }
      : m,
  );
  return {
    ledger: [...openings, ...stripped, ...neutral, ...standIns.values(), ...estimates],
    provisional: window.filter((m) => m.provisional && !m.voided),
    standIns,
  };
}

// Everything the engine needs about one user, read once inside the run's transaction.
export async function loadUser(tx: Db, userId: string, from?: Day) {
  const accounts = await tx.query<{ id: string; kind: AccountKind }>(
    `select a.id, a.kind from money_account a join account_access x on x.account_id = a.id
     where x.user_id = $1 and x.role = 'propietario' order by a.created_at, a.id`,
    [userId],
  );
  const ids = accounts.map((a) => a.id);

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

  const { ledger, provisional, standIns } = await loadLedger(tx, ids, interest, from);

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
  return { ledger, provisional, standIns, input, holdings };
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
    const [state] = await tx.query<{
      through: string;
      forecast: Forecast | null;
      touched: boolean;
      hand: string;
    }>(
      `select s.processed_through::text as through, s.forecast,
         -- Anything entered or voided by hand since the last run: then the whole ledger is read.
         exists (select 1 from movement m join account_access x on x.account_id = m.account_id
                 where x.user_id = s.user_id and x.role = 'propietario'
                   and (m.created_at > s.updated_at or m.voided_at > s.updated_at)) as touched,
         (select md5(coalesce(string_agg(m.account_id || m.day || m.amount_cents || (m.voided_at is not null),
                  ',' order by m.id), ''))
          from movement m join account_access x on x.account_id = m.account_id
          where x.user_id = s.user_id and x.role = 'propietario'
            and (m.source not in ('regla', 'motor') or m.voided_at is not null)) as hand
       from engine_state s where s.user_id = $1`,
      [userId],
    );
    if (!state) return null;
    const from = state.through < today ? state.through : today;
    const compact = !state.touched && state.forecast !== null;
    const { ledger, provisional, standIns, input, holdings } = await loadUser(
      tx,
      userId,
      compact ? from : undefined,
    );

    const fresh = advance(input, ledger, from, today);
    const col = <T>(f: (m: Movement) => T) => fresh.map(f);
    if (fresh.length)
      await tx.query(
        `insert into movement (account_id, day, seq, kind, amount_cents, instrument_id, qty_e8, price_e8,
           fx_e8, withholding_cents, transfer_id, source, rule_id, occurrence_key, provisional)
         select * from unnest($1::text[], $2::date[], $3::int[], $4::text[], $5::bigint[], $6::text[],
           $7::bigint[], $8::bigint[], $9::bigint[], $10::bigint[], $11::text[], $12::text[], $13::text[],
           $14::text[], $15::boolean[])
         on conflict (occurrence_key) where occurrence_key is not null do nothing`,
        [
          col((m) => m.accountId),
          col((m) => m.day),
          col((m) => m.seq),
          col((m) => m.kind),
          col((m) => m.amountCents),
          col((m) => m.instrumentId ?? null),
          col((m) => m.qtyE8?.toString() ?? null),
          col((m) => m.priceE8?.toString() ?? null),
          col((m) => m.fxE8?.toString() ?? null),
          col((m) => m.withholdingCents ?? 0),
          col((m) => m.transferId ?? null),
          col((m) => m.source),
          col((m) => m.ruleId ?? null),
          col((m) => m.occurrenceKey ?? null),
          col((m) => m.provisional ?? false),
        ],
      );

    // Provisional buys whose own day's close is now published.
    let repriced = 0;
    for (const m of provisional) {
      const q = input.market.close(m.instrumentId!, m.day);
      const fx = input.market.perEur(input.market.currency(m.instrumentId!), m.day);
      if (q?.day !== m.day || !fx) continue;
      const r = reprice(m, q.priceE8, fx);
      await tx.query(
        `update movement set price_e8 = $2, fx_e8 = $3, qty_e8 = $4, provisional = false where id = $1`,
        [m.id, r.priceE8!.toString(), r.fxE8!.toString(), r.qtyE8!.toString()],
      );
      // Compacted, the cache's stand-in holds the old units; whole, the movement itself does.
      const standIn = standIns.get(holdingKey(m.accountId, m.instrumentId!));
      if (standIn) standIn.qtyE8! += r.qtyE8! - m.qtyE8!;
      else Object.assign(m, r);
      repriced++;
    }

    const all = [...ledger, ...fresh];
    const ids = holdings.accounts.map((a) => a.id);
    await tx.query(`delete from position where account_id = any($1)`, [ids]);
    const held = [...fold(all).holdings].filter(([, h]) => h.qtyE8 > 0n);
    await tx.query(
      `insert into position (account_id, instrument_id, qty_e8, cost_cents)
       select * from unnest($1::text[], $2::text[], $3::bigint[], $4::bigint[])`,
      [
        held.map(([k]) => k.split('|')[0]),
        held.map(([k]) => k.split('|')[1]),
        held.map(([, h]) => h.qtyE8.toString()),
        held.map(([, h]) => Math.max(0, h.costCents)),
      ],
    );

    // History: each day the run went through (today too, as prices move), and each account at the
    // end of every month it crossed.
    const days: [Day, number, number][] = [];
    const months: [string, string, number, number][] = [];
    for (const d of new Set([...daysAfter(from, today), today])) {
      const v = valuation(holdings, all, d);
      const flows = outsideFlows(all, addDays(d, -1), d).reduce((s, m) => s + m.amountCents, 0);
      days.push([d, v.total, flows]);
      if (monthOf(addDays(d, 1)) !== monthOf(d))
        for (const [account, value] of Object.entries(v.byAccount)) {
          const own = all.filter((m) => m.accountId === account);
          const monthFlows = outsideFlows(own, addDays(`${monthOf(d)}-01`, -1), d);
          months.push([
            account,
            `${monthOf(d)}-01`,
            value,
            monthFlows.reduce((s, m) => s + m.amountCents, 0),
          ]);
        }
    }
    await tx.query(
      `insert into user_day (user_id, day, total_cents, flows_cents)
       select $1, * from unnest($2::date[], $3::bigint[], $4::bigint[])
       on conflict (user_id, day) do update set total_cents = excluded.total_cents, flows_cents = excluded.flows_cents`,
      [userId, days.map((x) => x[0]), days.map((x) => x[1]), days.map((x) => x[2])],
    );
    if (months.length)
      await tx.query(
        `insert into account_month (account_id, month, value_cents, flows_cents)
         select * from unnest($1::text[], $2::date[], $3::bigint[], $4::bigint[])
         on conflict (account_id, month) do update set value_cents = excluded.value_cents, flows_cents = excluded.flows_cents`,
        [
          months.map((x) => x[0]),
          months.map((x) => x[1]),
          months.map((x) => x[2]),
          months.map((x) => x[3]),
        ],
      );

    const { alerts: found, forecast } = alerts(
      input,
      holdings,
      all,
      today,
      state.forecast ?? undefined,
      state.hand,
    );
    await tx.query(
      `insert into alert (user_id, kind, account_id, instrument_id, day, dedupe_key)
       select $1, * from unnest($2::text[], $3::text[], $4::text[], $5::date[], $6::text[])
       on conflict (user_id, dedupe_key) do update set day = excluded.day,
         state = case when alert.state = 'resuelta' then 'abierta' else alert.state end`,
      [
        userId,
        found.map((a) => a.kind),
        found.map((a) => a.accountId ?? null),
        found.map((a) => a.instrumentId ?? null),
        found.map((a) => a.day),
        found.map((a) => a.key),
      ],
    );
    await tx.query(
      `update alert set state = 'resuelta' where user_id = $1 and state <> 'resuelta' and not (dedupe_key = any($2))`,
      [userId, found.map((a) => a.key)],
    );
    await tx.query(
      `update engine_state set processed_through = $2, forecast = $3, updated_at = now() where user_id = $1`,
      [userId, today, JSON.stringify(forecast)],
    );
    return { generated: fresh.length, repriced, alerts: found.length };
  });
}
