import { z } from 'zod';
import { ASSUMPTIONS_BP } from '#lib/engine/compound.ts';
import type { Baseline } from '#lib/engine/project.ts';
import type { Db } from './db/index.ts';

const rate = (min: number, max: number) =>
  z
    .number('Escribe un porcentaje, por ejemplo 6')
    .int()
    .min(min, `Entre ${min / 100} % y ${max / 100} %`)
    .max(max, `Entre ${min / 100} % y ${max / 100} %`);

export const assumptionsInput = z
  .object({
    prudente: rate(-5000, 5000),
    base: rate(-5000, 5000),
    optimista: rate(-5000, 5000),
    inflation: rate(-2000, 5000),
  })
  .refine((a) => a.prudente <= a.base && a.base <= a.optimista, {
    path: ['base'],
    message: 'Ordénalos: prudente ≤ base ≤ optimista',
  });
export type Assumptions = z.infer<typeof assumptionsInput>;

export async function getSettings(db: Db, userId: string) {
  const [row] = await db.query<{
    prudente: number;
    base: number;
    optimista: number;
    inflation: number;
    baseline: Baseline | null;
  }>(
    `select prudent_bp as prudente, base_bp as base, optimistic_bp as optimista,
       inflation_bp as inflation, plan_baseline as baseline
     from settings where user_id = $1`,
    [userId],
  );
  const { baseline = null, ...assumptions } = row ?? { ...ASSUMPTIONS_BP };
  return { assumptions: assumptions as Assumptions, baseline };
}

export async function saveAssumptions(db: Db, userId: string, a: Assumptions) {
  await db.query(
    `insert into settings (user_id, prudent_bp, base_bp, optimistic_bp, inflation_bp)
     values ($1, $2, $3, $4, $5)
     on conflict (user_id) do update set prudent_bp = $2, base_bp = $3, optimistic_bp = $4,
       inflation_bp = $5, updated_at = now()`,
    [userId, a.prudente, a.base, a.optimista, a.inflation],
  );
}

export async function saveBaseline(db: Db, userId: string, b: Baseline | null) {
  await db.query(
    `insert into settings (user_id, plan_baseline) values ($1, $2)
     on conflict (user_id) do update set plan_baseline = $2, updated_at = now()`,
    [userId, b === null ? null : JSON.stringify(b)],
  );
}
