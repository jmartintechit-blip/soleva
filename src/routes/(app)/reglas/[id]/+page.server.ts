import { error, fail, redirect } from '@sveltejs/kit';
import { parseEuros } from '#lib/engine/money.ts';
import { listAccounts } from '#lib/server/accounts.ts';
import { createRule, deleteRule, getRule, ruleInput, updateRule } from '#lib/server/rules.ts';
import { fieldErrors, requireUserId } from '#lib/server/session.ts';
import type { Actions, PageServerLoad } from './$types';

const NEW = 'nueva';

export const load: PageServerLoad = async (event) => {
  const userId = await requireUserId(event);
  const db = event.locals.db();
  const rule = event.params.id === NEW ? null : await getRule(db, userId, event.params.id);
  if (event.params.id !== NEW && !rule) error(404, 'No encontrada');
  const accounts = (await listAccounts(db, userId)).filter(
    (a) => !a.archived || a.id === rule?.fromAccountId || a.id === rule?.toAccountId,
  );
  if (!rule && !accounts.length) redirect(303, '/cuentas/nueva');
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  return {
    rule,
    accounts: accounts.map(({ id, name, kind }) => ({ id, name, kind })),
    // Today in Spain: the default day and start month.
    month: today.slice(0, 7),
    today: Number(today.slice(8, 10)),
  };
};

const FIELDS = [
  'type',
  'name',
  'amount',
  'frequency',
  'day',
  'startMonth',
  'endMonth',
  'from',
  'to',
];

export const actions: Actions = {
  guardar: async (event) => {
    const userId = await requireUserId(event);
    const form = await event.request.formData();
    const values = Object.fromEntries(FIELDS.map((k) => [k, String(form.get(k) ?? '').trim()]));
    const parsed = ruleInput.safeParse({
      name: values.name,
      type: values.type,
      amountCents: parseEuros(values.amount!) ?? Number.NaN,
      frequency: values.frequency,
      day: values.day ? Number(values.day) : Number.NaN,
      startMonth: values.startMonth,
      endMonth: values.endMonth || undefined,
      fromAccountId: values.from || undefined,
      toAccountId: values.to || undefined,
      active: form.get('active') !== 'false',
    });
    if (!parsed.success) {
      const e = fieldErrors(parsed.error);
      return fail(400, {
        values,
        errors: { ...e, amount: e.amountCents, from: e.fromAccountId, to: e.toAccountId },
      });
    }
    const db = event.locals.db();
    const ok =
      event.params.id === NEW
        ? (await createRule(db, userId, parsed.data)) !== null
        : await updateRule(db, userId, event.params.id, parsed.data);
    if (!ok) error(404, 'No encontrada');
    redirect(303, event.params.id === NEW ? '/reglas?creada' : '/reglas');
  },

  borrar: async (event) => {
    if (!(await deleteRule(event.locals.db(), await requireUserId(event), event.params.id)))
      error(404, 'No encontrada');
    redirect(303, '/reglas');
  },
};
