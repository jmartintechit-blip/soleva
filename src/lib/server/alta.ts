import type { Day } from '#lib/engine/day.ts';
import type { AltaKind } from '#lib/labels.ts';
import type { Db } from './db/index.ts';

// Alta inicial (b11/NAlta): each thing the user has goes in once, with what it is worth today.
// The account opens with that value; a debt opens negative, so net worth is the plain sum.
export async function openAccount(
  db: Db,
  userId: string,
  day: Day,
  a: { name: string; kind: AltaKind; cents: number; rateBp?: number },
): Promise<string> {
  return db.transaction(async (tx) => {
    const [{ id }] = await tx.query<{ id: string }>(
      `insert into money_account (user_id, name, kind, balance_cents, opened_on)
       values ($1, $2, $3, 0, $4) returning id`,
      [userId, a.name, a.kind, day],
    );
    if (a.cents)
      await tx.query(
        `insert into movement (account_id, day, kind, amount_cents, source)
         values ($1, $2, 'apertura', $3, 'manual')`,
        [id, day, a.kind === 'deuda_hipoteca' ? -a.cents : a.cents],
      );
    if (a.kind === 'remunerada') {
      // Monthly, on the daily balance, 19 % withheld: the usual terms; the details come later.
      await tx.query(`insert into interest_config (account_id) values ($1)`, [id]);
      await tx.query(`insert into interest_tier values ($1, null, $2)`, [id, a.rateBp ?? 0]);
    }
    return id!;
  });
}
