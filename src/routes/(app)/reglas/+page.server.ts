import { error, redirect } from '@sveltejs/kit';
import { listAccounts } from '#lib/server/accounts.ts';
import { listRules, setActive } from '#lib/server/rules.ts';
import { requireUserId } from '#lib/server/session.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const userId = await requireUserId(event);
  const db = event.locals.db();
  const [rules, accounts] = await Promise.all([listRules(db, userId), listAccounts(db, userId)]);
  return {
    rules,
    names: Object.fromEntries(accounts.map((a) => [a.id, a.name])),
    hasAccounts: accounts.some((a) => !a.archived),
    created: event.url.searchParams.has('creada'),
  };
};

export const actions: Actions = {
  activar: async (event) => {
    const form = await event.request.formData();
    const ok = await setActive(
      event.locals.db(),
      await requireUserId(event),
      String(form.get('id') ?? ''),
      form.get('active') === 'true',
    );
    if (!ok) error(404, 'No encontrada');
    redirect(303, '/reglas');
  },
};
