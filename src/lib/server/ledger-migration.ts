import type { Db } from './db/index.ts';

// The cut-over from v0 (balances, proposing rules and month closes) to the ledger, one user at a
// time and in one transaction. Runs once per user (B11); a second run changes nothing. The v0
// tables stay, read-only, until after v1.0.0.
//
// - Each account opens its ledger on `today` with its balance (a debt as a negative balance, so
//   net worth is always the plain sum of the ledger).
// - Each v0 rule becomes a generating rule; the watermark at `today` keeps it from generating the
//   past, which the balances already hold.
// - Each confirmed close becomes the account's month in the history. Outside flows before the
//   cut-over are unknown: returns count from it.
export async function migrateUserToLedger(db: Db, userId: string, today: string) {
  return db.transaction(async (tx) => {
    const done = await tx.query(`select 1 from engine_state where user_id = $1 for update`, [
      userId,
    ]);
    if (done.length) return false;

    await tx.query(
      `insert into movement (account_id, day, kind, amount_cents, source, occurrence_key, note)
       select id, $2, 'apertura', case when kind = 'deuda' then -balance_cents else balance_cents end,
              'migracion', 'migracion:' || id, 'Saldo al pasar al libro'
       from money_account where user_id = $1 and balance_cents <> 0`,
      [userId, today],
    );
    await tx.query(
      `update money_account set kind = case kind
         when 'inversion' then 'broker' when 'deuda' then 'deuda_prestamo' when 'otro' then 'bien'
         else kind end, updated_at = now()
       where user_id = $1`,
      [userId],
    );
    await tx.query(
      `insert into auto_rule (user_id, name, kind, frequency, day, start_on, end_on, from_account_id,
         to_account_id, amount_cents, active, created_at)
       select user_id, name,
         case type when 'entra' then 'ingreso' when 'sale' then 'gasto' else 'transferencia' end,
         frequency, case when frequency = 'una_vez' then null else day end,
         -- A one-off on its day, clamped to the month (31 in February is the 28th or 29th).
         case when frequency = 'una_vez'
           then least(start_month + (day - 1), (start_month + interval '1 month - 1 day')::date)
           else start_month end,
         (end_month + interval '1 month - 1 day')::date,
         from_account_id, to_account_id, amount_cents, active, created_at
       from rule where user_id = $1`,
      [userId],
    );
    await tx.query(
      `insert into account_month (account_id, month, value_cents, flows_cents)
       select l.account_id, c.month,
              case when l.is_debt then -l.confirmed_cents else l.confirmed_cents end, 0
       from month_close c join month_close_line l on l.close_id = c.id
       where c.user_id = $1 and c.status = 'confirmado'`,
      [userId],
    );
    await tx.query(`insert into engine_state (user_id, processed_through) values ($1, $2)`, [
      userId,
      today,
    ]);
    return true;
  });
}
