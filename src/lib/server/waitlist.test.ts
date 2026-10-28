import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { createPgliteDb } from './db/pglite.ts';
import { MAX_SIGNUPS_PER_HOUR, confirm, join, leave } from './waitlist.ts';

let db: Db;
beforeEach(async () => {
  db = createPgliteDb();
  await migrate(db);
});
afterEach(() => db.close());

const rows = () => db.query<{ email: string; confirmed_at: Date | null }>('select * from waitlist');

describe('waitlist', () => {
  it('joins once, confirms with the token and stores only its hash', async () => {
    const r = await join(db, 'ana@example.com');
    if (r.status !== 'new') throw new Error(r.status);
    expect(r.token).toMatch(/^[\w-]{43}$/);
    const [row] = await db.query<{ token_hash: string }>('select token_hash from waitlist');
    expect(row!.token_hash).not.toBe(r.token);

    expect(await join(db, 'ana@example.com')).toEqual({ status: 'known' });
    expect(await confirm(db, r.token)).toBe(true);
    expect((await rows())[0]!.confirmed_at).not.toBeNull();
    expect(await confirm(db, 'wrong')).toBe(false);
  });

  it('leaving deletes the row', async () => {
    const r = await join(db, 'ana@example.com');
    if (r.status !== 'new') throw new Error(r.status);
    expect(await leave(db, r.token)).toBe(true);
    expect(await rows()).toHaveLength(0);
    expect(await leave(db, r.token)).toBe(false);
  });

  it('caps sign-ups per hour for everyone', async () => {
    for (let i = 0; i < MAX_SIGNUPS_PER_HOUR; i++) {
      expect((await join(db, `u${i}@example.com`)).status).toBe('new');
    }
    expect(await join(db, 'late@example.com')).toEqual({ status: 'busy' });
  });

  it('forgets unconfirmed sign-ups after a week so the email can join again', async () => {
    await join(db, 'ana@example.com');
    await db.query(`update waitlist set created_at = now() - interval '8 days'`);
    expect((await join(db, 'ana@example.com')).status).toBe('new');
    expect(await rows()).toHaveLength(1);
  });

  it('rejects emails that are not lower case', async () => {
    await expect(join(db, 'Ana@example.com')).rejects.toThrow();
  });
});
