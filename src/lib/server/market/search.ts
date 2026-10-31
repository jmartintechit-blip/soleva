import type { Db } from '../db/index.ts';
import { type Fetch, fetchRetry } from './provider.ts';

export interface Candidate {
  symbol: string;
  exchange: string;
  // The exchange as people know it: XETRA, Amsterdam, London…
  market: string;
  name: string;
  kind: 'etf' | 'fondo' | 'accion' | 'etc' | 'cripto';
}

const KIND: Record<string, Candidate['kind']> = {
  ETF: 'etf',
  MUTUALFUND: 'fondo',
  EQUITY: 'accion',
  CRYPTOCURRENCY: 'cripto',
};

// Instruments by name, ISIN or ticker, in the order the search returns them (relevance to the
// text): no ranking of ours, nothing "popular" (CNMV red line). Physical ETCs come back as
// equities; whatever is called "ETC" is one.
export async function searchInstruments(q: string, f: Fetch = fetch): Promise<Candidate[]> {
  const text = q.trim().slice(0, 60);
  if (text.length < 2) return [];
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(text)}&quotesCount=10&newsCount=0`;
  const res = await fetchRetry(f, url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`search: ${res.status}`);
  const body = (await res.json()) as {
    quotes?: {
      symbol?: string;
      exchange?: string;
      exchDisp?: string;
      quoteType?: string;
      longname?: string;
      shortname?: string;
    }[];
  };
  return (body.quotes ?? []).flatMap((x) => {
    const name = x.longname ?? x.shortname ?? '';
    const kind = /\bETC\b/.test(name) ? 'etc' : KIND[x.quoteType ?? ''];
    return x.symbol && kind && name
      ? [
          {
            symbol: x.symbol,
            exchange: x.exchange ?? '',
            market: x.exchDisp ?? x.exchange ?? '',
            name,
            kind,
          },
        ]
      : [];
  });
}

// One product, however many exchanges list it: its listings, the euro one first.
export interface Product {
  name: string;
  kind: Candidate['kind'];
  isin: string | null;
  listings: Candidate[];
}

export const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
// Yahoo's codes for exchanges that trade in euros; Xetra and Amsterdam first, as most Spanish
// brokers do.
const EURO = [
  'GER',
  'AMS',
  'PAR',
  'MIL',
  'MCE',
  'BRU',
  'LIS',
  'VIE',
  'HEL',
  'ISE',
  'FRA',
  'STU',
  'MUN',
  'BER',
  'DUS',
  'HAM',
];
const rank = (c: Candidate) => {
  const i = EURO.indexOf(c.exchange);
  return i < 0 ? EURO.length : i;
};

// The ISIN of a product by its exact name, from ESMA's register of instruments (FIRDS), official
// and free; null when the name does not lead to exactly one, or the register does not answer.
export async function isinOf(name: string, f: Fetch = fetch): Promise<string | null> {
  try {
    const q = encodeURIComponent(`gnr_full_name:"${name.replace(/["\\]/g, ' ')}"`);
    const res = await f(
      `https://registers.esma.europa.eu/solr/esma_registers_firds/select?q=${q}&fq=type_s:parent&fl=isin,gnr_full_name&rows=100&wt=json`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      response?: { docs?: { isin?: string; gnr_full_name?: string }[] };
    };
    const found = new Set(
      (body.response?.docs ?? [])
        .filter((d) => d.gnr_full_name?.toLowerCase() === name.toLowerCase())
        .map((d) => d.isin)
        .filter((i): i is string => !!i && ISIN.test(i)),
    );
    return found.size === 1 ? [...found][0]! : null;
  } catch {
    return null;
  }
}

// The ISIN of a product listed under these symbols: the cache first, FIRDS once (saved for all).
export async function isinFor(
  db: Db,
  name: string,
  symbols: string[],
  f: Fetch = fetch,
): Promise<string | null> {
  const [hit] = await db.query<{ isin: string }>(
    `select isin from isin_cache where symbol = any($1) limit 1`,
    [symbols],
  );
  if (hit) return hit.isin;
  const isin = await isinOf(name, f);
  if (isin)
    await db.query(
      `insert into isin_cache (symbol, isin) select unnest($1::text[]), $2 on conflict do nothing`,
      [symbols, isin],
    );
  return isin;
}

// The ISINs the search lacks, by product name; arrives after the results, which never wait.
export async function missingIsins(
  db: Db,
  products: Product[],
  f: Fetch = fetch,
): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  await Promise.all(
    products
      .filter((p) => !p.isin && p.kind !== 'cripto')
      .map(async (p) => {
        const isin = await isinFor(
          db,
          p.name,
          p.listings.map((l) => l.symbol),
          f,
        ).catch(() => null);
        if (isin) found[p.name] = isin;
      }),
  );
  return found;
}

// The search, one row per product (same name = same product on another exchange), in the
// provider's order, with the ISINs already cached. An ISIN typed by the user is that product's.
export async function searchProducts(db: Db, q: string, f: Fetch = fetch): Promise<Product[]> {
  const text = q.trim().toUpperCase();
  let found = await searchInstruments(q, f);
  if (ISIN.test(text) && found[0]) {
    // Searching an ISIN finds one listing: its name finds the others.
    const name = found[0].name;
    found = [...found, ...(await searchInstruments(name, f))].filter((c) => c.name === name);
  }
  const groups = new Map<string, Product>();
  for (const c of found) {
    const key = c.name.toLowerCase();
    const g = groups.get(key) ?? { name: c.name, kind: c.kind, isin: null, listings: [] };
    if (!g.listings.some((l) => l.symbol === c.symbol)) g.listings.push(c);
    groups.set(key, g);
  }
  const products = [...groups.values()];
  for (const p of products) p.listings.sort((a, b) => rank(a) - rank(b));
  const cached = new Map(
    (
      await db.query<{ symbol: string; isin: string }>(
        `select symbol, isin from isin_cache where symbol = any($1)`,
        [found.map((c) => c.symbol)],
      )
    ).map((r) => [r.symbol, r.isin]),
  );
  for (const p of products)
    p.isin = ISIN.test(text)
      ? text
      : (p.listings.map((l) => cached.get(l.symbol)).find(Boolean) ?? null);
  return products;
}
