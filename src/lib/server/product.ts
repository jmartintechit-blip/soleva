import type { Day } from '#lib/engine/day.ts';
import { E8, divRound } from '#lib/engine/units.ts';
import type { Db } from './db/index.ts';
import { type Fetch } from './market/provider.ts';
import { lastClosedDay } from './market/refresh.ts';
import { type Candidate, isinOf, searchInstruments } from './market/search.ts';
import { yahoo } from './market/yahoo.ts';

// Añadir producto (b11/NProducto): a product the user already holds, by units and average price.
// It goes in as units from outside (an 'ajuste' marked 'producto'): cash does not change, its
// cost is the average price and its value that day is money put in, not a gain.
export const ADDED = 'producto';

export interface Quote extends Candidate {
  isin: string | null;
  currency: string;
  // Last close in euros ×10^8, and its day.
  priceEurE8: string;
  day: Day;
}

// Today's price of a search result, in euros; null if the provider or the exchange rate fails.
export async function quote(
  db: Db,
  symbol: string,
  today: Day,
  f: Fetch = fetch,
): Promise<{ quote: Quote; closes: { day: Day; priceE8: bigint }[]; perEurE8: bigint } | null> {
  try {
    const found = (await searchInstruments(symbol, f)).find((c) => c.symbol === symbol);
    if (!found) return null;
    const [s, isin] = await Promise.all([
      yahoo(f).closes(symbol),
      found.kind === 'cripto' ? null : isinOf(found.name, f),
    ]);
    const until = lastClosedDay(today, found.kind === 'cripto');
    const closes = s.closes.filter((c) => c.day <= until);
    const last = closes.at(-1);
    if (!last) return null;
    let perEurE8 = E8;
    if (s.currency !== 'EUR') {
      const [fx] = await db.query<{ e8: string }>(
        `select per_eur_e8::text as e8 from fx_rate where currency = $1 and day <= $2
         order by day desc limit 1`,
        [s.currency, today],
      );
      if (!fx) return null;
      perEurE8 = BigInt(fx.e8);
    }
    return {
      quote: {
        ...found,
        isin,
        currency: s.currency,
        priceEurE8: divRound(last.priceE8 * E8, perEurE8).toString(),
        day: last.day,
      },
      closes,
      perEurE8,
    };
  } catch {
    return null;
  }
}

// Adds what the user holds; null without the right to change the account, 'sin_precio' when the
// product cannot be priced now. The average price is in euros ×10^8.
export async function addProduct(
  db: Db,
  userId: string,
  accountId: string,
  day: Day,
  input: { symbol: string; qtyE8: bigint; avgEurE8: bigint },
  f: Fetch = fetch,
): Promise<string | null | 'sin_precio'> {
  const [ok] = await db.query(
    `select 1 from account_access where account_id = $1 and user_id = $2
     and role in ('propietario', 'editor')`,
    [accountId, userId],
  );
  if (!ok) return null;
  const q = await quote(db, input.symbol, day, f);
  if (!q) return 'sin_precio';
  return db.transaction(async (tx) => {
    // Already in this account (same ISIN, or same name on another exchange): it adds to that
    // position instead of opening another.
    const [held] = await tx.query<{ id: string; currency: string; isin: string | null }>(
      `select i.id, i.currency, i.isin from movement m join instrument i on i.id = m.instrument_id
       where m.account_id = $1 and m.voided_at is null and i.kind <> 'estimado'
         and (i.isin = $2 or lower(i.name) = lower($3))
       order by i.isin = $2 desc nulls last limit 1`,
      [accountId, q.quote.isin, q.quote.name],
    );
    let id = held?.id;
    let perEurE8 = q.perEurE8;
    if (held && held.currency !== q.quote.currency) {
      const [fx] = await tx.query<{ e8: string }>(
        `select per_eur_e8::text as e8 from fx_rate where currency = $1 and day <= $2
         order by day desc limit 1`,
        [held.currency, day],
      );
      if (!fx && held.currency !== 'EUR') return 'sin_precio';
      perEurE8 = held.currency === 'EUR' ? E8 : BigInt(fx!.e8);
    }
    if (!id) {
      // Shared by everyone who holds it; named by the provider, never by what the page sent.
      await tx.query(
        `insert into instrument (kind, name, currency, price_source, source_id, ticker)
         values ($1, $2, $3, 'yahoo', $4, $5)
         on conflict (price_source, source_id) where owner_user_id is null do nothing`,
        [
          q.quote.kind,
          q.quote.name.slice(0, 120),
          q.quote.currency,
          q.quote.symbol,
          q.quote.symbol.slice(0, 20),
        ],
      );
      [{ id }] = await tx.query<{ id: string }>(
        `select id from instrument where price_source = 'yahoo' and source_id = $1 and owner_user_id is null`,
        [q.quote.symbol],
      );
      for (const c of q.closes)
        await tx.query(
          `insert into price (instrument_id, day, close_e8, source) values ($1, $2, $3, 'yahoo')
           on conflict do nothing`,
          [id, c.day, c.priceE8.toString()],
        );
    }
    if (q.quote.isin)
      await tx.query(`update instrument set isin = $2 where id = $1 and isin is null`, [
        id,
        q.quote.isin,
      ]);
    await tx.query(
      `insert into movement (account_id, day, seq, kind, amount_cents, instrument_id, qty_e8, price_e8,
         fx_e8, source, note)
       values ($1, $2, 0, 'ajuste', 0, $3, $4, $5, $6, 'manual', $7)`,
      [
        accountId,
        day,
        id,
        input.qtyE8.toString(),
        divRound(input.avgEurE8 * perEurE8, E8).toString(),
        perEurE8.toString(),
        ADDED,
      ],
    );
    return id!;
  });
}
