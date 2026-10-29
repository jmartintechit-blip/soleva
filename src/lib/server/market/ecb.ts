import type { Day } from '#lib/engine/day.ts';
import { type Fetch, fetchRetry } from './provider.ts';
import { toE8 } from '#lib/engine/units.ts';

// ECB euro reference rates (free, commercial reuse allowed citing "Fuente: estadísticas del
// BCE"): units of each currency per euro, published around 16:00 CET on working days.
export async function ecbRates(f: Fetch = fetch, lastDays = 10) {
  const url = `https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?lastNObservations=${lastDays}&format=csvdata&detail=dataonly`;
  const res = await fetchRetry(f, url, { headers: { accept: 'text/csv' } });
  if (!res.ok) throw new Error(`ecb: ${res.status}`);
  return parseEcb(await res.text());
}

// KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE…
export function parseEcb(csv: string): { currency: string; day: Day; perEurE8: bigint }[] {
  const [head, ...lines] = csv.trim().split(/\r?\n/);
  const cols = head!.split(',');
  const [c, t, v] = ['CURRENCY', 'TIME_PERIOD', 'OBS_VALUE'].map((n) => cols.indexOf(n));
  return lines.flatMap((line) => {
    const cells = line.split(',');
    const value = cells[v!];
    return /^\d+(\.\d+)?$/.test(value ?? '') && /^[A-Z]{3}$/.test(cells[c!] ?? '')
      ? [{ currency: cells[c!]!, day: cells[t!]!, perEurE8: toE8(value!) }]
      : [];
  });
}
