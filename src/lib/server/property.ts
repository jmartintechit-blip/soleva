import type { Day } from '#lib/engine/day.ts';
import { roundHalfAwayFromZero } from '#lib/engine/money.ts';
import { PROVINCE_NAME, type PropertyKind } from '#lib/labels.ts';
import type { Db } from './db/index.ts';
import { normalize } from './housing.ts';

// Vivienda o inmueble (b12/RInmueble, LEEME-B12-inmueble): always an asset, its mortgage apart.

export interface Place {
  code: string;
  name: string;
  province: string;
}

const place = (r: { code: string; name: string }): Place => ({
  code: r.code,
  name: r.name,
  province: PROVINCE_NAME[r.code.slice(0, 2)] ?? '',
});

// Municipalities whose name has the text, those that start with it first.
export async function searchMunicipalities(db: Db, q: string): Promise<Place[]> {
  const text = normalize(q.slice(0, 60));
  if (text.length < 2) return [];
  const rows = await db.query<{ code: string; name: string }>(
    `select code, name from municipality where search like '%' || $1 || '%'
     order by search like $1 || '%' desc, length(name), name limit 8`,
    [text],
  );
  return rows.map(place);
}

export interface M2 {
  place: Place;
  // Where the figure comes from: the municipality, or its province when it has under 25.000.
  area: 'municipio' | 'provincia';
  eurM2Cents: number;
  quarter: Day;
  // The same, brought to the region's latest quarter of the index (as is until a newer one).
  todayEurM2Cents: number;
  region: string;
}

// The Ministry of Housing's average appraised value per m² of a municipality, or of its province;
// null when neither is known.
export async function m2Of(db: Db, code: string): Promise<M2 | null> {
  const [r] = await db.query<{
    code: string;
    name: string;
    region: string;
    area: string | null;
    quarter: Day | null;
    cents: number | null;
    now: number | null;
    then: number | null;
  }>(
    `with m as (
       select m.code, m.name, m.region,
              coalesce((select z.region from housing_index z where z.region = m.region limit 1),
                       '00') as idx
       from municipality m where m.code = $1),
     v as (
       select a.area, a.quarter, a.eur_m2_cents from housing_m2 a, m
       where a.area in (m.code, left(m.code, 2)) order by length(a.area) desc limit 1)
     select m.code, m.name, m.region, v.area, v.quarter::text as quarter, v.eur_m2_cents as cents,
            (select index_e3 from housing_index where region = m.idx
             order by quarter desc limit 1) as now,
            (select index_e3 from housing_index where region = m.idx and quarter <= v.quarter
             order by quarter desc limit 1) as then
     from m left join v on true`,
    [code],
  );
  if (!r?.area || !r.cents || !r.quarter) return null;
  return {
    place: place(r),
    area: r.area.length === 5 ? 'municipio' : 'provincia',
    eurM2Cents: r.cents,
    quarter: r.quarter,
    todayEurM2Cents: r.now && r.then ? roundHalfAwayFromZero((r.cents * r.now) / r.then) : r.cents,
    region: r.region,
  };
}

export interface PropertyInput {
  name: string;
  kind: PropertyKind;
  municipalityCode: string;
  areaM2: number;
  purchaseYear?: number;
  purchaseCents?: number;
  method: 'm2' | 'propio';
  // With 'propio': what it is worth today.
  ownCents?: number;
  growthBp: number;
  mortgageAccountId?: string;
}

// Opens the property with its value: m² × the Ministry's €/m², which refers to the Ministry's
// quarter (the index moves it from there), or the user's own, from today. 'sin_dato' without a
// figure for the municipality or its province; null when the mortgage is not a debt the user
// can change.
export async function createProperty(
  db: Db,
  userId: string,
  day: Day,
  p: PropertyInput,
): Promise<string | 'sin_dato' | null> {
  let cents = p.ownCents ?? 0;
  let valueOn = day;
  if (p.method === 'm2') {
    const m2 = await m2Of(db, p.municipalityCode);
    if (!m2) return 'sin_dato';
    cents = roundHalfAwayFromZero(p.areaM2 * m2.eurM2Cents);
    valueOn = m2.quarter;
  }
  try {
    return await db.transaction(async (tx) => {
      const [{ id }] = await tx.query<{ id: string }>(
        `insert into money_account (user_id, name, kind, balance_cents, opened_on)
         values ($1, $2, 'inmueble', 0, $3) returning id`,
        [userId, p.name, day],
      );
      await tx.query(
        `insert into property (account_id, kind, municipality_code, area_m2, purchase_year,
           purchase_cents, value_method, value_on, growth_bp, mortgage_account_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          p.kind,
          p.municipalityCode,
          p.areaM2,
          p.purchaseYear ?? null,
          p.purchaseCents ?? null,
          p.method,
          valueOn,
          p.growthBp,
          p.mortgageAccountId ?? null,
        ],
      );
      await tx.query(
        `insert into movement (account_id, day, kind, amount_cents, source)
         values ($1, $2, 'apertura', $3, 'manual')`,
        [id, day, cents],
      );
      return id!;
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P0001') return null;
    throw error;
  }
}
