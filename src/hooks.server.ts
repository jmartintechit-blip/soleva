import { building, dev } from '$app/env';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool } from '@neondatabase/serverless';
import type { Handle } from '@sveltejs/kit/hooks';
import { env, waitUntil } from 'cloudflare:workers';
import { isAuthPath, svelteKitHandler } from 'better-auth/svelte-kit';
import { asTheme, THEME_COOKIE } from '#lib/labels.ts';
import { createAuth, type Auth } from '#lib/server/auth.ts';
import { createNeonDb, type Db } from '#lib/server/db/index.ts';
import { otpEmail, sendEmail, type Email } from '#lib/server/email.ts';

// CSP comes from the Kit config (vite.config.ts); these complete it on every dynamic response.
const SECURITY_HEADERS = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  // Not indexed until the public beta.
  'x-robots-tag': 'noindex, nofollow',
};

function secure(res: Response): Response {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

// Building Better Auth costs ~9 ms of CPU (Workers Free allows 10 per request), so it is built
// once per isolate and origin. Its queries go to the current request's pool instead: Workers
// cannot reuse sockets across requests.
async function mail(email: Email): Promise<void> {
  if (env.RESEND_API_KEY) return sendEmail(env.RESEND_API_KEY, email);
  if (dev) return console.log(`[dev] email para ${email.to}: ${email.subject}\n${email.text}`);
  throw new Error('RESEND_API_KEY is not set');
}

const requestPool = new AsyncLocalStorage<() => Pool>();
const currentPool = { connect: () => requestPool.getStore()!().connect() };
const auths = new Map<string, Auth>();

function authFor(origin: string): Auth {
  let auth = auths.get(origin);
  if (!auth) {
    auth = createAuth({
      pool: currentPool,
      secret: env.BETTER_AUTH_SECRET,
      baseURL: origin,
      // Unset or empty means nobody can sign in: closed until the beta opens.
      allowedEmails: (env.ALLOWED_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
      sendOtp: (email, otp) => mail(otpEmail(email, otp)),
    });
    auths.set(origin, auth);
  }
  return auth;
}

export const handle: Handle = async ({ event, resolve }) => {
  if (building) return resolve(event);
  // The pool is opened only when a query runs, so public pages stay cheap.
  let pool: Pool | undefined;
  const getPool = () => (pool ??= new Pool({ connectionString: env.DATABASE_URL, max: 1 }));
  let db: Db | undefined;
  event.locals.auth = () => authFor(event.url.origin);
  event.locals.db = () => (db ??= createNeonDb(getPool()));
  event.locals.mail = mail;
  try {
    return await requestPool.run(getPool, async () => {
      if (isAuthPath(event.url.toString(), { basePath: '/api/auth' })) {
        return secure(
          await svelteKitHandler({ auth: event.locals.auth(), event, resolve, building }),
        );
      }
      // The chosen theme is painted on the server too, so the app never flashes Amanecer first.
      const theme = asTheme(event.cookies.get(THEME_COOKIE));
      if (theme === 'amanecer' || !event.route.id?.startsWith('/(app)'))
        return secure(await resolve(event));
      return secure(
        await resolve(event, {
          transformPageChunk: ({ html }) =>
            html.replace('data-theme="amanecer"', `data-theme="${theme}"`),
        }),
      );
    });
  } finally {
    if (pool) waitUntil(pool.end());
  }
};
