import type { Db, Row } from './db/index.ts';

const iso = (col: string) => `to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
const month = (col: string) => `to_char(${col}, 'YYYY-MM')`;

// Everything the user wrote down, one flat table per kind, so JSON and CSV share it (GDPR art. 20).
// Amounts stay in cents and rates in basis points, as everywhere else.
export async function exportData(db: Db, userId: string) {
  const q = (sql: string) => db.query(sql, [userId]);
  const [ajustes, cuentas, reglas, cierres, enmiendas] = await Promise.all([
    q(`select u.email, ${iso('u."createdAt"')} as user_created_at,
         coalesce(s.prudent_bp, 300) as prudent_bp, coalesce(s.base_bp, 600) as base_bp,
         coalesce(s.optimistic_bp, 800) as optimistic_bp, coalesce(s.inflation_bp, 250) as inflation_bp,
         coalesce(s.reminder_day, 1) as reminder_day,
         coalesce(s.reminder_enabled, true) as reminder_enabled,
         s.plan_baseline::text as plan_baseline
       from "user" u left join settings s on s.user_id = u.id where u.id = $1`),
    q(`select id, name, kind, balance_cents::float8 as balance_cents, is_estimated, annual_rate_bp,
         ${iso('archived_at')} as archived_at, ${iso('created_at')} as created_at
       from money_account where user_id = $1 order by created_at, id`),
    q(`select id, name, type, amount_cents::float8 as amount_cents, frequency, day,
         ${month('start_month')} as start_month, ${month('end_month')} as end_month,
         from_account_id, to_account_id, active, ${iso('created_at')} as created_at
       from rule where user_id = $1 order by created_at, id`),
    q(`select ${month('c.month')} as month, c.status, ${iso('c.confirmed_at')} as confirmed_at,
         l.account_id, a.name as account_name, l.is_debt,
         l.proposed_cents::float8 as proposed_cents, l.confirmed_cents::float8 as confirmed_cents
       from month_close c join month_close_line l on l.close_id = c.id
       join money_account a on a.id = l.account_id
       where c.user_id = $1 order by c.month, a.name, l.account_id`),
    q(`select ${month('c.month')} as month, e.account_id, e.previous_cents::float8 as previous_cents,
         e.new_cents::float8 as new_cents, e.reason, ${iso('e.created_at')} as created_at
       from close_amendment e join month_close c on c.id = e.close_id
       where c.user_id = $1 order by e.created_at, e.id`),
  ]);
  return { ajustes, cuentas, reglas, cierres, enmiendas };
}

export type ExportTable = keyof Awaited<ReturnType<typeof exportData>>;
export const EXPORT_TABLES: ExportTable[] = [
  'cuentas',
  'reglas',
  'cierres',
  'enmiendas',
  'ajustes',
];

// RFC 4180, plus a leading quote on cells a spreadsheet would run as a formula.
export function toCsv(rows: Row[]): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const head = Object.keys(rows[0] ?? {});
  return [head, ...rows.map((r) => head.map((k) => r[k]))]
    .map((line) => line.map(cell).join(','))
    .join('\r\n');
}

// Every session of the user, on every device.
export async function endSessions(db: Db, userId: string) {
  await db.query(`delete from session where "userId" = $1`, [userId]);
}

// For real: the user row cascades to sessions, accounts, rules, closes and settings; pending
// sign-in codes are keyed by email ("<type>-otp-<email>"), not by user, so they go by hand.
export async function deleteUser(db: Db, userId: string) {
  await db.transaction(async (tx) => {
    const [user] = await tx.query<{ email: string }>(`select email from "user" where id = $1`, [
      userId,
    ]);
    if (!user) return;
    await tx.query(
      `delete from verification where right(identifier, length($1) + 5) = '-otp-' || $1`,
      [user.email],
    );
    await tx.query(`delete from "user" where id = $1`, [userId]);
  });
}
