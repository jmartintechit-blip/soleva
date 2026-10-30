import { addMonths } from '#lib/engine/dates.ts';
import { type Day, addDays, dayIn, monthOf } from '#lib/engine/day.ts';
import type { StoredAlert } from '#lib/alerts.ts';
import { moneyWeighted } from '#lib/engine/insight.ts';
import { PERIODS, type PeriodKey } from '#lib/labels.ts';
import type { Db } from './db/index.ts';

export interface DayRow {
  day: Day;
  total: number;
  flows: number;
  // account → [value, own flows, interest earned and not paid yet (in the value)]
  accounts: Record<string, [number, number, number?]>;
}

export { PERIODS, type PeriodKey };

// The day each period starts from (its value is the one at the end of that day).
export function periodStart(key: PeriodKey, today: Day, first: Day): Day {
  const back = (months: number) =>
    dayIn(addMonths(monthOf(today), -months), Number(today.slice(8)));
  switch (key) {
    case 'dia':
      return addDays(today, -1);
    case 'mes':
      return addDays(`${monthOf(today)}-01`, -1);
    case 'm3':
      return back(3);
    case 'm6':
      return back(6);
    case 'ano':
      return back(12);
    case 'todo':
      return addDays(first, -1);
  }
}

// What one period says: the value now, what you put in, what your money made (in € and as a
// money-weighted %), what each account made (its own transfers are flows, never gains) and the
// line to draw. Before the first day there was nothing.
export function period(rows: DayRow[], key: PeriodKey, today: Day) {
  const sorted = [...rows].sort((a, b) => (a.day < b.day ? -1 : 1));
  const first = sorted[0]?.day ?? today;
  const start = periodStart(key, today, first);
  const at = (day: Day) => sorted.findLast((r) => r.day <= day);
  const startRow = at(start);
  const end = at(today);
  const inside = sorted.filter((r) => r.day > start && r.day <= today);
  const startValue = startRow?.total ?? 0;
  const endValue = end?.total ?? 0;
  const mw = moneyWeighted(
    startValue,
    endValue,
    inside.map((r) => ({ day: r.day, cents: r.flows })),
    start,
    today,
  );
  const accounts: Record<string, number> = {};
  for (const id of new Set([
    ...Object.keys(end?.accounts ?? {}),
    ...Object.keys(startRow?.accounts ?? {}),
  ]))
    accounts[id] =
      (end?.accounts[id]?.[0] ?? 0) -
      (startRow?.accounts[id]?.[0] ?? 0) -
      inside.reduce((s, r) => s + (r.accounts[id]?.[1] ?? 0), 0);
  return {
    start,
    value: endValue,
    change: endValue - startValue,
    put: mw.putCents,
    made: mw.madeCents,
    rate: mw.period,
    accounts,
    series: [startValue, ...inside.map((r) => r.total)],
  };
}

export async function loadHome(db: Db, userId: string) {
  const [{ j }] = await db.query<{ j: string }>(
    `with a as (
       select a.id, a.name, a.kind, a.archived_at, a.created_at from money_account a
       join account_access x on x.account_id = a.id where x.user_id = $1 and x.role = 'propietario')
     select json_build_object(
       'days', (select coalesce(json_agg(json_build_array(day, total_cents, flows_cents, accounts) order by day), '[]')
                from user_day where user_id = $1),
       'classes', (select classes from user_day where user_id = $1 order by day desc limit 1),
       'accounts', (select coalesce(json_agg(json_build_object('id', id, 'name', name, 'kind', kind)
                      order by created_at, id), '[]') from a where archived_at is null),
       'alerts', (select coalesce(json_agg(json_build_object('id', l.id, 'accountId', l.account_id, 'detail', l.detail, 'kind', l.kind, 'day', l.day,
                    'account', (select name from a where a.id = l.account_id),
                    'instrument', (select name from instrument i where i.id = l.instrument_id))
                    order by l.state, l.day), '[]')
                  from alert l where l.user_id = $1 and l.state = 'abierta')
     )::text as j`,
    [userId],
  );
  const data = JSON.parse(j) as {
    days: [Day, number, number, DayRow['accounts']][];
    classes: Record<string, number> | null;
    accounts: { id: string; name: string; kind: string }[];
    alerts: StoredAlert[];
  };
  return {
    rows: data.days.map(([day, total, flows, accounts]): DayRow => ({
      day,
      total,
      flows,
      accounts,
    })),
    classes: data.classes ?? {},
    accounts: data.accounts,
    alerts: data.alerts,
  };
}
