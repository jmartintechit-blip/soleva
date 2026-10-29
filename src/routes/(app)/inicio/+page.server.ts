import { loadPlan } from '#lib/server/plan.ts';
import { requireUserId } from '#lib/server/session.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) =>
  loadPlan(event.locals.db(), await requireUserId(event));
