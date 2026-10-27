import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuth } from './auth.ts';
import { migrate } from './db/migrate.ts';
import { createPgliteDb, pgliteAsPool } from './db/pglite.ts';

const baseURL = 'http://localhost:5173';
let pglite: PGlite;
let auth: ReturnType<typeof createAuth>;
let sent: { email: string; otp: string }[];

beforeEach(async () => {
  pglite = new PGlite();
  await migrate(createPgliteDb(pglite));
  sent = [];
  auth = createAuth({
    pool: pgliteAsPool(pglite),
    secret: 'test-secret-'.repeat(4),
    baseURL,
    sendOtp: async (email, otp) => void sent.push({ email, otp }),
  });
});
afterEach(() => pglite.close());

const post = (path: string, body: unknown, ip = '203.0.113.1') =>
  auth.handler(
    new Request(`${baseURL}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseURL, 'cf-connecting-ip': ip },
      body: JSON.stringify(body),
    }),
  );
const sendCode = (email: string, ip?: string) =>
  post('/email-otp/send-verification-otp', { email, type: 'sign-in' }, ip);
const signIn = (email: string, otp: string) => post('/sign-in/email-otp', { email, otp });

describe('email code sign-in', () => {
  it('signs in with the emailed code and creates the user', async () => {
    expect((await sendCode('ana@example.com')).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.otp).toMatch(/^\d{6}$/);

    const res = await signIn('ana@example.com', sent[0]!.otp);
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/HttpOnly/i);

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.email).toBe('ana@example.com');
  });

  it('stores the code hashed, not in clear', async () => {
    await sendCode('ana@example.com');
    const { rows } = await pglite.query<{ value: string }>('select value from verification');
    expect(rows[0]!.value).not.toContain(sent[0]!.otp);
  });

  it('burns the code after 3 wrong attempts', async () => {
    await sendCode('ana@example.com');
    const wrong = sent[0]!.otp === '000000' ? '111111' : '000000';
    for (let i = 0; i < 3; i++) expect((await signIn('ana@example.com', wrong)).status).toBe(400);
    expect((await signIn('ana@example.com', sent[0]!.otp)).ok).toBe(false);
  });

  it('limits code requests per IP', async () => {
    for (let i = 0; i < 3; i++) expect((await sendCode(`u${i}@example.com`)).status).toBe(200);
    expect((await sendCode('u3@example.com')).status).toBe(429);
    expect((await sendCode('u3@example.com', '203.0.113.2')).status).toBe(200);
  });
});
