import type { Day } from '#lib/engine/day.ts';
import type { Db } from './db/index.ts';
import { runUser } from './engine-run.ts';
import { marketstack } from './market/marketstack.ts';
import { mobula } from './market/mobula.ts';
import type { MarketDeps } from './market/refresh.ts';
import { refreshPrices, refreshRates } from './market/refresh.ts';
import { yahoo } from './market/yahoo.ts';

export type Job = { type: 'prices' } | { type: 'user'; userId: string };

// Yahoo always; Mobula and Marketstack only with their keys (Marketstack costs money: setting
// its key is Juan's call). An instrument says which one prices it.
export function marketDeps(env: {
  MOBULA_API_KEY?: string;
  MARKETSTACK_API_KEY?: string;
}): MarketDeps {
  return {
    providers: {
      yahoo: yahoo(),
      ...(env.MOBULA_API_KEY ? { mobula: mobula(env.MOBULA_API_KEY) } : {}),
      ...(env.MARKETSTACK_API_KEY ? { marketstack: marketstack(env.MARKETSTACK_API_KEY) } : {}),
    },
  };
}

// The 07:00 cron: shared data first (rates, Euribor, one batch of prices), then one queue message
// per user behind, so each gets its own Worker invocation (and its own CPU budget). A user whose
// run fails is retried by the queue, and the next day catches up whatever was missed.
export async function daily(
  db: Db,
  deps: MarketDeps,
  today: Day,
  send: (jobs: Job[]) => Promise<unknown>,
) {
  const rates = await refreshRates(db, deps.fetch).catch((error) => ({ error: String(error) }));
  const prices = await refreshPrices(db, deps, today);
  const users = await db.query<{ user_id: string }>(
    `select user_id from engine_state where processed_through < $1 order by user_id`,
    [today],
  );
  const jobs: Job[] = [
    ...(prices.more ? [{ type: 'prices' } as const] : []),
    ...users.map((u) => ({ type: 'user' as const, userId: u.user_id })),
  ];
  // A queue takes at most 100 messages per batch.
  for (let i = 0; i < jobs.length; i += 100) await send(jobs.slice(i, i + 100));
  return {
    rates,
    prices: { stored: prices.stored, failed: prices.failed.length },
    users: users.length,
  };
}

export async function work(
  db: Db,
  deps: MarketDeps,
  job: Job,
  today: Day,
  send: (jobs: Job[]) => Promise<unknown>,
) {
  if (job.type === 'user') return runUser(db, job.userId, today);
  const prices = await refreshPrices(db, deps, today);
  if (prices.more) await send([{ type: 'prices' }]);
  return prices;
}
