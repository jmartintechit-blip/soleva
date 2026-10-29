import { fail, redirect } from '@sveltejs/kit';
import { parsePercent } from '#lib/engine/money.ts';
import { currentBaseline, loadPlan } from '#lib/server/plan.ts';
import { fieldErrors, requireUserId } from '#lib/server/session.ts';
import { assumptionsInput, saveAssumptions, saveBaseline } from '#lib/server/settings.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) =>
  loadPlan(event.locals.db(), await requireUserId(event));

const KEYS = ['prudente', 'base', 'optimista', 'inflation'] as const;

export const actions: Actions = {
  supuestos: async (event) => {
    const userId = await requireUserId(event);
    const form = await event.request.formData();
    const values = Object.fromEntries(KEYS.map((k) => [k, String(form.get(k) ?? '').trim()]));
    const parsed = assumptionsInput.safeParse(
      Object.fromEntries(KEYS.map((k) => [k, parsePercent(values[k]!) ?? Number.NaN])),
    );
    if (!parsed.success) return fail(400, { values, errors: fieldErrors(parsed.error) });
    await saveAssumptions(event.locals.db(), userId, parsed.data);
    redirect(303, '/proyeccion');
  },

  // Fixes today's base projection as "my plan"; the light compares against it from then on.
  fijar: async (event) => {
    const userId = await requireUserId(event);
    const db = event.locals.db();
    await saveBaseline(db, userId, await currentBaseline(db, userId));
    redirect(303, '/proyeccion');
  },
};
