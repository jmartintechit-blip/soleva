import { redirect } from '@sveltejs/kit';
import { lastClosedMonth, monthToClose, netWorthHistory } from '#lib/server/closes.ts';
import { runUser } from '#lib/server/engine-run.ts';
import { PERIODS, loadHome, period } from '#lib/server/home.ts';
import { loadPlan, today } from '#lib/server/plan.ts';
import { requireUserId } from '#lib/server/session.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const db = event.locals.db();
  const userId = await requireUserId(event);
  const day = today();
  const [state] = await db.query<{ through: string }>(
    `select processed_through::text as through from engine_state where user_id = $1`,
    [userId],
  );
  if (state) {
    // On the ledger: catch up first if the cron has not run for this user yet today.
    if (state.through < day) await runUser(db, userId, day);
    const home = await loadHome(db, userId);
    // Nothing in yet: the Alta inicial first.
    if (!home.accounts.length) redirect(303, '/alta');
    const last = home.rows.at(-1);
    return {
      ledger: true as const,
      today: day,
      periods: Object.fromEntries(PERIODS.map((p) => [p.key, period(home.rows, p.key, day)])),
      accounts: home.accounts.map((a) => ({
        ...a,
        value: last?.accounts[a.id]?.[0] ?? 0,
        accrued: last?.accounts[a.id]?.[2] ?? 0,
      })),
      classes: home.classes,
      alerts: home.alerts,
    };
  }
  const [plan, history, last] = await Promise.all([
    loadPlan(db, userId),
    netWorthHistory(db, userId),
    lastClosedMonth(db, userId),
  ]);
  // The last 11 closed months; today's net worth is the 12th point.
  return {
    ledger: false as const,
    ...plan,
    history: history.slice(-11),
    toClose: monthToClose(day, last),
  };
};
