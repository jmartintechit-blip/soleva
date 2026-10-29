import { lastClosedMonth, monthToClose, netWorthHistory } from '#lib/server/closes.ts';
import { loadPlan, today } from '#lib/server/plan.ts';
import { requireUserId } from '#lib/server/session.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const db = event.locals.db();
  const userId = await requireUserId(event);
  const [plan, history, last] = await Promise.all([
    loadPlan(db, userId),
    netWorthHistory(db, userId),
    lastClosedMonth(db, userId),
  ]);
  // The last 11 closed months; today's net worth is the 12th point.
  return { ...plan, history: history.slice(-11), toClose: monthToClose(today(), last) };
};
