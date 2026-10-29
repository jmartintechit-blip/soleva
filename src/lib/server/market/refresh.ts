import { type Day, addDays, isWeekend } from '#lib/engine/day.ts';
import type { Db } from '../db/index.ts';
import { euribor12m } from './bde.ts';
import { ecbRates } from './ecb.ts';
import type { Fetch, PriceProvider } from './provider.ts';

export interface MarketDeps {
  providers: Partial<Record<PriceProvider['name'], PriceProvider>>;
  fetch?: Fetch;
}

// The last weekday before `today`: its close is final by the 07:00 cron (bars of today are not).
export function lastClosedDay(today: Day): Day {
  let d = addDays(today, -1);
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}

// ECB rates and the official Euribor: shared by everyone, kept forever, cheap to ask again.
export async function refreshRates(db: Db, f: Fetch = fetch) {
  const fx = await ecbRates(f);
  for (const r of fx)
    await db.query(
      `insert into fx_rate (currency, day, per_eur_e8) values ($1, $2, $3) on conflict do nothing`,
      [r.currency, r.day, r.perEurE8.toString()],
    );
  const idx = await euribor12m(f);
  for (const r of idx)
    await db.query(
      `insert into index_rate (index, month, rate_bp) values ('euribor_12m', $1, $2)
       on conflict do nothing`,
      [r.month, r.rateBp],
    );
  return { fx: fx.length, euribor: idx.length };
}

// Daily closes of the shared instruments somebody holds or buys with a plan, oldest first and at
// most `limit` per call (a Worker on the free plan has 50 outgoing requests): the price table is
// the cache, so one already up to date is not asked again. A failure only leaves that instrument
// stale; its holders see the alert and can enter the price by hand.
export async function refreshPrices(db: Db, deps: MarketDeps, today: Day, limit = 40) {
  const closed = lastClosedDay(today);
  const due = await db.query<{ id: string; source: PriceProvider['name']; symbol: string }>(
    `select i.id, i.price_source as source, i.source_id as symbol
     from instrument i
     left join lateral (select max(day) as last from price p where p.instrument_id = i.id) p on true
     where i.owner_user_id is null and i.price_source in ('yahoo', 'mobula', 'marketstack')
       and (exists (select 1 from position x where x.instrument_id = i.id and x.qty_e8 > 0)
            or exists (select 1 from auto_rule_leg l join auto_rule r on r.id = l.rule_id
                       where l.instrument_id = i.id and r.active))
       and (p.last is null or p.last < case when i.price_source = 'mobula' then $1::date else $2::date end)
     order by p.last nulls first, i.id
     limit $3`,
    [today, closed, limit + 1],
  );
  const failed: string[] = [];
  let stored = 0;
  for (const i of due.slice(0, limit)) {
    const provider = deps.providers[i.source];
    try {
      if (!provider) throw new Error(`${i.source} is off`);
      const s = await provider.closes(i.symbol);
      // Only finished days (crypto: the price of the run is today's).
      const until = i.source === 'mobula' ? today : closed;
      for (const c of s.closes.filter((c) => c.day <= until)) {
        const rows = await db.query(
          `insert into price (instrument_id, day, close_e8, source) values ($1, $2, $3, $4)
           on conflict do nothing returning 1`,
          [i.id, c.day, c.priceE8.toString(), i.source],
        );
        stored += rows.length;
      }
    } catch {
      failed.push(i.id);
    }
  }
  return { stored, failed, more: due.length > limit };
}
