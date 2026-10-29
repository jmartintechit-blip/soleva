import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { createPgliteDb } from './db/pglite.ts';
import { type Job, daily, marketDeps, work } from './daily.ts';

let db: Db;
beforeEach(async () => {
  db = createPgliteDb();
  await migrate(db);
  for (const [id, through] of [
    ['ana', '2026-11-08'],
    ['eva', '2026-11-09'],
  ])
    await db
      .query(`insert into "user" (id, name, email, "emailVerified") values ($1, '', $2, true)`, [
        id,
        `${id}@x.es`,
      ])
      .then(() => db.query(`insert into engine_state values ($1, $2)`, [id, through]));
});
afterEach(() => db.close());

describe('daily', () => {
  it('queues one job per user still behind, after the shared data', async () => {
    const sent: Job[] = [];
    const r = await daily(
      db,
      { providers: {}, fetch: async () => Promise.reject(new Error('offline')) },
      '2026-11-09',
      async (jobs) => void sent.push(...jobs),
    );
    // Offline: the rates fail and are reported, the rest goes on.
    expect(r).toMatchObject({ prices: { stored: 0, failed: 0 }, users: 1 });
    expect('error' in r.rates).toBe(true);
    expect(sent).toEqual([{ type: 'user', userId: 'ana' }]);
    expect(await work(db, { providers: {} }, sent[0]!, '2026-11-09', async () => {})).toMatchObject(
      { generated: 0 },
    );
    expect(
      await db.query(`select processed_through::text as d from engine_state where user_id = 'ana'`),
    ).toEqual([{ d: '2026-11-09' }]);
  });

  it('turns on Mobula and Marketstack only with their keys', () => {
    expect(Object.keys(marketDeps({}).providers)).toEqual(['yahoo']);
    expect(
      Object.keys(marketDeps({ MOBULA_API_KEY: 'k', MARKETSTACK_API_KEY: 'm' }).providers),
    ).toEqual(['yahoo', 'mobula', 'marketstack']);
  });
});
