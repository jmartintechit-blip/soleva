import { type Fetch, fetchRetry } from './provider.ts';

// The official monthly 12-month Euribor (the mortgage reference index) from the Banco de España's
// statistics API, series D_1NBAF472. Its source is EMMI; the BdE republishes it monthly.
const URL =
  'https://app.bde.es/bierest/resources/srdatosapp/listaSeries?idioma=es&series=D_1NBAF472&rango=30M';

export async function euribor12m(f: Fetch = fetch) {
  const res = await fetchRetry(f, URL, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`bde: ${res.status}`);
  return parseBde(await res.json());
}

// [{ fechas: ['2026-09-01T08:15:00Z', …], valores: [3.247, …] }] → months and basis points.
export function parseBde(body: unknown): { month: string; rateBp: number }[] {
  const s = (body as { fechas?: string[]; valores?: (number | null)[] }[])[0];
  if (!s?.fechas || !s.valores) throw new Error('bde: unexpected answer');
  return s.fechas.flatMap((f, i) => {
    const v = s.valores![i];
    return typeof v === 'number' && /^\d{4}-\d{2}/.test(f)
      ? [{ month: `${f.slice(0, 7)}-01`, rateBp: Math.round(v * 1000) / 10 }]
      : [];
  });
}
