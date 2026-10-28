import { z } from 'zod';
import type { Rule } from '#lib/engine/rules.ts';
import { MAX_CENTS } from './accounts.ts';
import type { Db } from './db/index.ts';

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes no válido');
const accountId = z.string().min(1).max(64);

export const ruleInput = z
  .object({
    name: z.string().trim().min(1, 'Ponle un nombre').max(60, 'Máximo 60 caracteres'),
    type: z.enum(['entra', 'sale', 'mueve'], 'Elige qué hace la regla'),
    amountCents: z.number().int().min(1, 'Pon un importe').max(MAX_CENTS, 'Importe demasiado alto'),
    frequency: z.enum(['mensual', 'trimestral', 'anual', 'una_vez'], 'Elige cada cuánto'),
    day: z.number().int().min(1, 'Día entre 1 y 31').max(31, 'Día entre 1 y 31'),
    startMonth: month,
    endMonth: month.optional(),
    fromAccountId: accountId.optional(),
    toAccountId: accountId.optional(),
    active: z.boolean(),
  })
  .superRefine((r, ctx) => {
    const need = (path: 'fromAccountId' | 'toAccountId', message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (r.type !== 'entra' && !r.fromAccountId) need('fromAccountId', 'Elige de qué cuenta sale');
    if (r.type !== 'sale' && !r.toAccountId) need('toAccountId', 'Elige a qué cuenta va');
    if (r.type === 'mueve' && r.fromAccountId && r.fromAccountId === r.toAccountId)
      need('toAccountId', 'Elige dos cuentas distintas');
    if (r.endMonth && r.endMonth < r.startMonth)
      ctx.addIssue({ code: 'custom', path: ['endMonth'], message: 'Termina antes de empezar' });
  })
  // The unused side is dropped, as the database requires.
  .transform((r) => ({
    ...r,
    fromAccountId: r.type === 'entra' ? undefined : r.fromAccountId,
    toAccountId: r.type === 'sale' ? undefined : r.toAccountId,
  }));
export type RuleInput = z.infer<typeof ruleInput>;

export type StoredRule = Rule & { name: string };

const columns = `id, name, type, amount_cents::float8 as "amountCents", frequency, day,
  to_char(start_month, 'YYYY-MM') as "startMonth", to_char(end_month, 'YYYY-MM') as "endMonth",
  from_account_id as "fromAccountId", to_account_id as "toAccountId", active`;

// Nulls from SQL become absent fields, as the engine expects.
const clean = (r: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null)) as unknown as StoredRule;

export const listRules = async (db: Db, userId: string) =>
  (
    await db.query(`select ${columns} from rule where user_id = $1 order by created_at, id`, [
      userId,
    ])
  ).map(clean);

export async function getRule(db: Db, userId: string, id: string) {
  const [row] = await db.query(`select ${columns} from rule where user_id = $1 and id = $2`, [
    userId,
    id,
  ]);
  return row ? clean(row) : null;
}

const params = (r: RuleInput) => [
  r.name,
  r.type,
  r.amountCents,
  r.frequency,
  r.day,
  `${r.startMonth}-01`,
  r.endMonth ? `${r.endMonth}-01` : null,
  r.fromAccountId ?? null,
  r.toAccountId ?? null,
  r.active,
];

// The composite foreign keys reject accounts of another user (or none): treat it as not found.
const FOREIGN_KEY_VIOLATION = '23503';
async function orNotFound<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    if ((error as { code?: string }).code === FOREIGN_KEY_VIOLATION) return null;
    throw error;
  }
}

// Null when an account is not the user's (→ 404).
export const createRule = (db: Db, userId: string, r: RuleInput) =>
  orNotFound(async () => {
    const [row] = await db.query<{ id: string }>(
      `insert into rule (user_id, name, type, amount_cents, frequency, day, start_month, end_month,
         from_account_id, to_account_id, active)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
      [userId, ...params(r)],
    );
    return row!.id;
  });

// False when the rule or one of its accounts is not the user's (→ 404).
export const updateRule = async (db: Db, userId: string, id: string, r: RuleInput) =>
  (await orNotFound(async () => {
    const rows = await db.query(
      `update rule set name = $3, type = $4, amount_cents = $5, frequency = $6, day = $7,
         start_month = $8, end_month = $9, from_account_id = $10, to_account_id = $11, active = $12,
         updated_at = now()
       where user_id = $1 and id = $2 returning id`,
      [userId, id, ...params(r)],
    );
    return rows.length > 0;
  })) === true;

export async function setActive(db: Db, userId: string, id: string, active: boolean) {
  const rows = await db.query(
    `update rule set active = $3, updated_at = now() where user_id = $1 and id = $2 returning id`,
    [userId, id, active],
  );
  return rows.length > 0;
}

export async function deleteRule(db: Db, userId: string, id: string) {
  const rows = await db.query(`delete from rule where user_id = $1 and id = $2 returning id`, [
    userId,
    id,
  ]);
  return rows.length > 0;
}
