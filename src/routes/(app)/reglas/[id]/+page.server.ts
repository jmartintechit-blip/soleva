import { error, fail, redirect } from '@sveltejs/kit';
import { parseEuros } from '#lib/engine/money.ts';
import { listAccounts } from '#lib/server/accounts.ts';
import {
  deleteAutoRule,
  getAutoRule,
  readRuleForm,
  ruleAccounts,
  saveAutoRule,
  setAutoActive,
} from '#lib/server/auto-rules.ts';
import { runUser } from '#lib/server/engine-run.ts';
import { today as madridToday } from '#lib/server/plan.ts';
import { createRule, deleteRule, getRule, ruleInput, updateRule } from '#lib/server/rules.ts';
import { fieldErrors, requireUserId } from '#lib/server/session.ts';
import type { Actions, PageServerLoad } from './$types';

const NEW = 'nueva';

export const load: PageServerLoad = async (event) => {
  const userId = await requireUserId(event);
  const db = event.locals.db();
  const [ledger] = await db.query(`select 1 from engine_state where user_id = $1`, [userId]);
  if (ledger) {
    const auto = event.params.id === NEW ? null : await getAutoRule(db, userId, event.params.id);
    if (event.params.id !== NEW && !auto) error(404, 'No encontrada');
    const accounts = await ruleAccounts(db, userId);
    if (!auto && !accounts.length) redirect(303, '/alta');
    return {
      ledger: { rule: auto, accounts, today: madridToday() },
      rule: null,
      accounts: [],
      month: '',
      today: 0,
    };
  }
  const rule = event.params.id === NEW ? null : await getRule(db, userId, event.params.id);
  if (event.params.id !== NEW && !rule) error(404, 'No encontrada');
  const accounts = (await listAccounts(db, userId)).filter(
    (a) => !a.archived || a.id === rule?.fromAccountId || a.id === rule?.toAccountId,
  );
  if (!rule && !accounts.length) redirect(303, '/cuentas/nueva');
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  return {
    ledger: null,
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

  // On the ledger (b12/RRegla).
  guardar_regla: async (event) => {
    const userId = await requireUserId(event);
    const day = madridToday();
    const read = readRuleForm(await event.request.formData(), day);
    if (!read.ok) return fail(400, { values: read.values, errors: read.errors });
    const db = event.locals.db();
    const id = await saveAutoRule(
      db,
      userId,
      event.params.id === NEW ? null : event.params.id,
      read.input,
    );
    if (!id) error(404, 'No encontrada');
    await runUser(db, userId, day);
    redirect(303, event.params.id === NEW ? '/reglas?creada' : '/reglas');
  },
  pausar_regla: async (event) => {
    const form = await event.request.formData();
    const ok = await setAutoActive(
      event.locals.db(),
      await requireUserId(event),
      event.params.id,
      form.get('active') === 'true',
    );
    if (!ok) error(404, 'No encontrada');
    redirect(303, '/reglas');
  },
  borrar_regla: async (event) => {
    const done = await deleteAutoRule(
      event.locals.db(),
      await requireUserId(event),
      event.params.id,
    );
    if (!done) error(404, 'No encontrada');
    if (done === 'historial')
      return fail(409, {
        values: undefined,
        errors: { form: 'Ya generó movimientos: páusala para que no siga.' },
      });
    redirect(303, '/reglas');
  },

  borrar: async (event) => {
    if (!(await deleteRule(event.locals.db(), await requireUserId(event), event.params.id)))
      error(404, 'No encontrada');
    redirect(303, '/reglas');
  },
};
