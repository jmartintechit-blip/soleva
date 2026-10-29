import { type Fetch, fetchRetry } from './provider.ts';

export interface Candidate {
  symbol: string;
  exchange: string;
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
      quoteType?: string;
      longname?: string;
      shortname?: string;
    }[];
  };
  return (body.quotes ?? []).flatMap((x) => {
    const name = x.longname ?? x.shortname ?? '';
    const kind = /\bETC\b/.test(name) ? 'etc' : KIND[x.quoteType ?? ''];
    return x.symbol && kind && name
      ? [{ symbol: x.symbol, exchange: x.exchange ?? '', name, kind }]
      : [];
  });
}
