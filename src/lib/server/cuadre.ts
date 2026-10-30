import type { Day } from '#lib/engine/day.ts';
import { UNIT_STEP } from '#lib/engine/units.ts';
import type { Db } from './db/index.ts';

// Cuadre (b11/NCuadre): what the ledger says the account holds against what the user sees in
// their bank or broker. Each difference is one 'ajuste' of today; rules and plans do not change.

export interface CuadreRow {
  // null: the account's cash.
  instrumentId: string | null;
  name: string;
  kind: string;
  // Cents for cash, units ×10^8 for a product.
  expected: string;
}

const CAN_EDIT = `exists (select 1 from account_access x
  where x.account_id = $2 and x.user_id = $1 and x.role in ('propietario', 'editor'))`;

// The account and what Soleva thinks is there; null when the user cannot change it (404).
export async function loadCuadre(db: Db, userId: string, accountId: string) {
  const [{ j }] = await db.query<{ j: string | null }>(
    `select case when not ${CAN_EDIT} then null else json_build_object(
       'account', (select json_build_object('id', id, 'name', name, 'kind', kind)
                   from money_account where id = $2),
       'rows', (select coalesce(json_agg(r order by r."instrumentId" is not null, r.name), '[]') from (
           select null as "instrumentId", 'Efectivo' as name, 'efectivo' as kind,
                  coalesce(sum(amount_cents), 0)::text as expected
             from movement where account_id = $2 and voided_at is null
           union all
           select i.id, i.name, i.kind, sum(m.qty_e8)::text
             from movement m join instrument i on i.id = m.instrument_id
            where m.account_id = $2 and m.voided_at is null and m.qty_e8 is not null
            group by i.id having sum(m.qty_e8) <> 0) r)
     ) end::text as j`,
    [userId, accountId],
  );
  if (!j) return null;
  return JSON.parse(j) as {
    account: { id: string; name: string; kind: string };
    rows: CuadreRow[];
  };
}

// Moves the ledger to what is real (units to the 6 decimals people see): one 'ajuste' per difference, worked out here from the
// movements (never from what the page sent as expected). Products only among those the account
// holds or held. Returns how many were saved, or null without access.
export async function saveCuadre(
  db: Db,
  userId: string,
  accountId: string,
  day: Day,
  real: { cashCents?: number; units: Record<string, bigint> },
): Promise<number | null> {
  return db.transaction(async (tx) => {
    const [ok] = await tx.query(`select 1 where ${CAN_EDIT}`, [userId, accountId]);
    if (!ok) return null;
    let saved = 0;
    if (real.cashCents !== undefined)
      saved += (
        await tx.query(
          `insert into movement (account_id, day, seq, kind, amount_cents, source)
           select $1, $2, 999, 'ajuste', $3::bigint - coalesce(sum(amount_cents), 0), 'cuadre'
             from movement where account_id = $1 and voided_at is null
           having $3::bigint <> coalesce(sum(amount_cents), 0)
           returning 1`,
          [accountId, day, real.cashCents],
        )
      ).length;
    for (const [instrumentId, qty] of Object.entries(real.units))
      saved += (
        await tx.query(
          `insert into movement (account_id, day, seq, kind, amount_cents, instrument_id, qty_e8, source)
           select $1, $2, 999, 'ajuste', 0, $3, $4::bigint - sum(qty_e8), 'cuadre'
             from movement where account_id = $1 and instrument_id = $3 and voided_at is null
              and qty_e8 is not null
           having count(*) > 0 and abs($4::bigint - sum(qty_e8)) >= $5
           returning 1`,
          [accountId, day, instrumentId, qty.toString(), UNIT_STEP.toString()],
        )
      ).length;
    return saved;
  });
}
