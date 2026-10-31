import type { Db } from './db/index.ts';
import type { Fetch } from './market/provider.ts';
import type { Cell } from './sheets.ts';

// Official data to value a home (LEEME-B12-inmueble): INE's municipalities, the Ministry of
// Housing's average appraised value per m² and INE's housing price index (IPV).

export const SOURCES = {
  // Relación de municipios a 1 de enero; {yy} is the year's last two digits.
  municipalities: 'https://www.ine.es/daco/daco42/codmun/diccionario{yy}.xlsx',
  // 4. Valor tasado de vivienda libre de los municipios mayores de 25.000 habitantes.
  municipalM2: 'https://apps.fomento.gob.es/BoletinOnline2/sedal/35103500.XLS',
  // Valor tasado de la vivienda, by province and region.
  provinceM2: 'https://cdn.mivau.gob.es/portal-web-mivau/Datos_MIVAU/CSV/VDP006_01.csv',
  // Índices por CCAA: general, vivienda nueva y de segunda mano. Trimestrales (base 2025).
  index: 'https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/80270?tip=AM&nult=',
};

const quarterStart = (year: number, q: number) =>
  `${year}-${String(q * 3 - 2).padStart(2, '0')}-01`;
const cents = (eurM2: number) => Math.round(eurM2 * 100);

// Lowercase, no accents, the article in front ("Ejido (El)" and "Ejido, El" are "el ejido").
export function normalize(name: string): string {
  const s = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const art = /^(.*?)(?:\s*\((\S+)\)|,\s*(\S+))$/.exec(s);
  const t =
    art && /^(el|la|los|las|l'|o|a|os|as|les|es|s')$/.test(art[2] ?? art[3]!)
      ? `${art[2] ?? art[3]} ${art[1]}`
      : s;
  return t.replace(/[^a-z0-9]+/g, ' ').trim();
}

export interface Municipality {
  code: string;
  name: string;
  region: string;
}

// INE's list: CODAUTO, CPRO, CMUN, DC, NOMBRE from the third row.
export function parseMunicipalities(rows: Cell[][]): Municipality[] {
  const head = rows.findIndex((r) => r[0] === 'CODAUTO');
  if (head < 0) throw new Error('municipalities: no CODAUTO header');
  return rows.slice(head + 1).flatMap((r) =>
    r[4]
      ? [
          {
            code: String(r[1]).padStart(2, '0') + String(r[2]).padStart(3, '0'),
            name: String(r[4]),
            region: String(r[0]).padStart(2, '0'),
          },
        ]
      : [],
  );
}

// Names the Ministry writes otherwise than INE, by INE code; and the few that two municipalities
// share. A municipality that crosses 25.000 inhabitants and does not match fails the import.
const ALIASES: Record<string, string> = {
  'puerto de santa maria': '11027',
  mahon: '07032',
  'palma de mallorca': '07040',
  'santa eulalia del rio': '07054',
  'san cristobal laguna': '38023',
  'santa cruz detenerife': '38038',
  'santa coloma gramanet': '08245',
  vitoria: '01059',
  mieres: '33037',
  torrent: '46244',
  cieza: '30019',
};

// The latest sheet (T2A2026…) of the Ministry's table by municipality: name and "Total" €/m²,
// matched to INE's codes. The province column is not reliable (its label is not always on its
// group's first row), so the code says it.
export function parseMunicipalM2(sheets: { name: string; rows: Cell[][] }[], list: Municipality[]) {
  const quarterOf = (n: string) => /^T([1-4])A(\d{4})/.exec(n.trim());
  const last = sheets.filter((s) => quarterOf(s.name)).at(-1);
  if (!last) throw new Error('municipal m2: no quarter sheet');
  const [, q, y] = quarterOf(last.name)!;
  const byName = new Map<string, string[]>();
  for (const m of list)
    for (const n of new Set([m.name, ...m.name.split('/')]))
      byName.set(normalize(n), [...(byName.get(normalize(n)) ?? []), m.code]);
  const head = last.rows.findIndex((r) => r[2] === 'Municipio');
  const out: { area: string; eurM2Cents: number }[] = [];
  const unmatched: string[] = [];
  for (const r of last.rows.slice(head + 1)) {
    if (typeof r[2] !== 'string' || !r[2].trim() || !(Number(r[5]) > 0)) continue;
    const names = [r[2], ...r[2].split('/')].map(normalize);
    const code =
      names.map((n) => ALIASES[n]).find(Boolean) ??
      names.map((n) => byName.get(n)).find((c) => c?.length === 1)?.[0];
    if (code) out.push({ area: code, eurM2Cents: cents(Number(r[5])) });
    else unmatched.push(r[2]);
  }
  if (unmatched.length) throw new Error(`municipal m2: unmatched ${unmatched.join(', ')}`);
  return { quarter: quarterStart(Number(y), Number(q)), rows: out };
}

// Regions of one province, which the Ministry gives only as the region's total.
const ONE_PROVINCE: Record<string, string> = {
  'asturias principado de': '33',
  'madrid comunidad de': '28',
  'murcia region de': '30',
  'navarra comunidad foral de': '31',
};

// The Ministry's CSV by province (UTF-8 with BOM, «;»): the latest quarter with a value for each.
export function parseProvinceM2(csv: string) {
  const text = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const col = head!.split(';');
  const at = (name: string) => col.indexOf(name);
  const [year, q, value, regime, cpro, region] = [
    'Año',
    'Trimestre',
    'Valor',
    'Régimen',
    'CPRO',
    'Comunidad_Autónoma',
  ].map(at);
  if ([year, q, value, regime, cpro, region].some((i) => i! < 0))
    throw new Error('province m2: columns');
  const latest = new Map<string, { quarter: string; eurM2Cents: number }>();
  for (const line of lines) {
    const f = line.split(';');
    const area = /^\d{1,2}$/.test(f[cpro!] ?? '')
      ? f[cpro!]!.padStart(2, '0')
      : ONE_PROVINCE[normalize(f[region!] ?? '')];
    if (f[regime!] !== 'Libre' || !area || !f[value!]) continue;
    const quarter = quarterStart(Number(f[year!]), Number(f[q!]));
    if ((latest.get(area)?.quarter ?? '') < quarter)
      latest.set(area, { quarter, eurM2Cents: cents(Number(f[value!])) });
  }
  return [...latest].map(([area, v]) => ({ area, ...v }));
}

// INE's IPV table (tip=AM): second-hand home index per region, by quarter.
export function parseIndex(json: unknown) {
  const series = json as {
    Nombre: string;
    MetaData?: { Codigo: string }[];
    Data: { Anyo: number; T3_Periodo: string; Valor: number | null }[];
  }[];
  return series
    .filter((s) => /Vivienda segunda mano\. Índice\./.test(s.Nombre))
    .flatMap((s) => {
      // The first variable is the region: '00' Spain, '01' Andalucía…
      const region = s.MetaData?.[0]?.Codigo;
      if (!region || !/^\d{2}$/.test(region)) return [];
      return s.Data.filter((d) => d.Valor !== null && /^T[1-4]$/.test(d.T3_Periodo)).map((d) => ({
        region,
        quarter: quarterStart(d.Anyo, Number(d.T3_Periodo[1])),
        indexE3: Math.round(d.Valor! * 1000),
      }));
    });
}

export async function storeIndex(db: Db, rows: ReturnType<typeof parseIndex>) {
  await db.query(
    `insert into housing_index (region, quarter, index_e3)
     select * from unnest($1::text[], $2::date[], $3::int[])
     on conflict (region, quarter) do update set index_e3 = excluded.index_e3`,
    [rows.map((r) => r.region), rows.map((r) => r.quarter), rows.map((r) => r.indexE3)],
  );
  return rows.length;
}

// The cron, on Mondays: the last two quarters (INE revises the previous one).
export async function refreshHousingIndex(db: Db, f: Fetch = fetch) {
  const res = await f(`${SOURCES.index}2`);
  if (!res.ok) throw new Error(`ipv: ${res.status}`);
  return storeIndex(db, parseIndex(await res.json()));
}

export async function importHousing(
  db: Db,
  data: {
    municipalities: Municipality[];
    municipal: ReturnType<typeof parseMunicipalM2>;
    provinces: ReturnType<typeof parseProvinceM2>;
    index: ReturnType<typeof parseIndex>;
  },
) {
  const { municipalities: m, municipal, provinces } = data;
  if (m.length < 8000) throw new Error(`municipalities: only ${m.length}`);
  return db.transaction(async (tx) => {
    await tx.query(
      `insert into municipality (code, name, search, region)
       select * from unnest($1::text[], $2::text[], $3::text[], $4::text[])
       on conflict (code) do update set name = excluded.name, search = excluded.search,
         region = excluded.region`,
      [
        m.map((x) => x.code),
        m.map((x) => x.name),
        m.map((x) => normalize(x.name)),
        m.map((x) => x.region),
      ],
    );
    const areas = [
      ...municipal.rows.map((r) => ({ ...r, quarter: municipal.quarter })),
      ...provinces,
    ];
    await tx.query(
      `insert into housing_m2 (area, quarter, eur_m2_cents)
       select * from unnest($1::text[], $2::date[], $3::int[])
       on conflict (area) do update set quarter = excluded.quarter,
         eur_m2_cents = excluded.eur_m2_cents`,
      [areas.map((a) => a.area), areas.map((a) => a.quarter), areas.map((a) => a.eurM2Cents)],
    );
    return {
      municipalities: m.length,
      municipal: municipal.rows.length,
      provinces: provinces.length,
      index: await storeIndex(tx, data.index),
    };
  });
}
