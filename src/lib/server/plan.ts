import { baselineFrom, project } from '#lib/engine/project.ts';
import { netWorth } from '#lib/engine/rules.ts';
import { listAccounts } from './accounts.ts';
import type { Db } from './db/index.ts';
import { listRules } from './rules.ts';
import { getSettings } from './settings.ts';

// Today in Spain (YYYY-MM-DD) and its month: projections start after it.
export const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
export const thisMonth = () => today().slice(0, 7);

// Everything the projection screens need, in engine shape.
export async function loadPlan(db: Db, userId: string) {
  const [accounts, rules, settings] = await Promise.all([
    listAccounts(db, userId),
    listRules(db, userId),
    getSettings(db, userId),
  ]);
  return { accounts, rules, ...settings, month: thisMonth() };
}

// "My plan" is built here from stored data, never taken from the browser. 20 years.
export async function currentBaseline(db: Db, userId: string) {
  const { accounts, rules, assumptions, month } = await loadPlan(db, userId);
  const points = project(
    accounts,
    rules,
    month,
    { annualBp: assumptions.base, inflationBp: assumptions.inflation },
    240,
  );
  return baselineFrom(netWorth(accounts), points, month);
}
