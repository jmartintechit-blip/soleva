import { error, redirect } from '@sveltejs/kit';
import { listAccounts } from '#lib/server/accounts.ts';
import { listAutoRules, ruleAccounts, setAutoActive } from '#lib/server/auto-rules.ts';
import { listRules, setActive } from '#lib/server/rules.ts';
import { requireUserId } from '#lib/server/session.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const userId = await requireUserId(event);
  const db = event.locals.db();
  // On the ledger: the rules that generate movements (b12/RRegla, RPlan); before, v0's.
  const [ledger] = await db.query(`select 1 from engine_state where user_id = $1`, [userId]);
  if (ledger) {
    const [rules, accounts] = await Promise.all([
      listAutoRules(db, userId),
      db.query<{ id: string; name: string }>(
        `select a.id, a.name from money_account a join account_access x on x.account_id = a.id
         where x.user_id = $1`,
        [userId],
      ),
    ]);
    return {
      ledger: {
        rules,
        names: Object.fromEntries(accounts.map((a) => [a.id, a.name])),
        hasAccounts: (await ruleAccounts(db, userId)).length > 0,
      },
      rules: [],
      names: {} as Record<string, string>,
      hasAccounts: false,
      created: event.url.searchParams.has('creada'),
    };
  }
  const [rules, accounts] = await Promise.all([listRules(db, userId), listAccounts(db, userId)]);
  return {
    ledger: null,
    rules,
    names: Object.fromEntries(accounts.map((a) => [a.id, a.name])),
    hasAccounts: accounts.some((a) => !a.archived),
    created: event.url.searchParams.has('creada'),
  };
};

export const actions: Actions = {
  pausar: async (event) => {
    const form = await event.request.formData();
    const ok = await setAutoActive(
      event.locals.db(),
      await requireUserId(event),
      String(form.get('id') ?? ''),
      form.get('active') === 'true',
    );
    if (!ok) error(404, 'No encontrada');
    redirect(303, '/reglas');
  },
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
