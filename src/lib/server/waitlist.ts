import type { Db } from './db/index.ts';

// Caps confirmation emails (Resend Free: 100 a day, shared with sign-in codes) whoever sends them.
export const MAX_SIGNUPS_PER_HOUR = 20;
// Unconfirmed sign-ups are not kept: after this, the email can join again.
const UNCONFIRMED_DAYS = 7;

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const hash = async (token: string) =>
  base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));

const newToken = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

export type JoinResult = { status: 'new'; token: string } | { status: 'known' | 'busy' };

// 'known' answers the same to the visitor as 'new' but sends nothing, so nobody can probe the list.
export async function join(db: Db, email: string): Promise<JoinResult> {
  return db.transaction(async (tx) => {
    await tx.query(
      `delete from waitlist where confirmed_at is null and created_at < now() - make_interval(days => $1)`,
      [UNCONFIRMED_DAYS],
    );
    const [recent] = await tx.query<{ n: number }>(
      `select count(*)::int as n from waitlist where created_at > now() - interval '1 hour'`,
    );
    if (recent!.n >= MAX_SIGNUPS_PER_HOUR) return { status: 'busy' };
    const token = newToken();
    const rows = await tx.query(
      `insert into waitlist (email, token_hash, consent_at) values ($1, $2, now())
       on conflict (email) do nothing returning email`,
      [email, await hash(token)],
    );
    return rows.length ? { status: 'new', token } : { status: 'known' };
  });
}

export async function confirm(db: Db, token: string): Promise<boolean> {
  const rows = await db.query(
    `update waitlist set confirmed_at = coalesce(confirmed_at, now()) where token_hash = $1
     returning email`,
    [await hash(token)],
  );
  return rows.length > 0;
}

// Leaving deletes the row: nothing is kept about who left.
export async function leave(db: Db, token: string): Promise<boolean> {
  const rows = await db.query(`delete from waitlist where token_hash = $1 returning email`, [
    await hash(token),
  ]);
  return rows.length > 0;
}
