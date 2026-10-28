import { building, dev } from '$app/env';
import { Pool } from '@neondatabase/serverless';
import type { Handle } from '@sveltejs/kit/hooks';
import { env, waitUntil } from 'cloudflare:workers';
import { isAuthPath, svelteKitHandler } from 'better-auth/svelte-kit';
import { createAuth, type Auth } from '#lib/server/auth.ts';
import { sendOtpEmail } from '#lib/server/email.ts';

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

export const handle: Handle = async ({ event, resolve }) => {
  if (building) return resolve(event);
  // Auth (and its database pool) is built only when a route asks for it, so public pages stay cheap.
  // One pool per request: Workers cannot reuse sockets across requests.
  let pool: Pool | undefined;
  let auth: Auth | undefined;
  event.locals.auth = () =>
    (auth ??= createAuth({
      pool: (pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 })),
      secret: env.BETTER_AUTH_SECRET,
      baseURL: event.url.origin,
      // Unset or empty means nobody can sign in: closed until the beta opens.
      allowedEmails: (env.ALLOWED_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
      sendOtp: async (email, otp) => {
        if (env.RESEND_API_KEY) return sendOtpEmail(env.RESEND_API_KEY, email, otp);
        if (dev) return console.log(`[dev] código para ${email}: ${otp}`);
        throw new Error('RESEND_API_KEY is not set');
      },
    }));
  try {
    if (isAuthPath(event.url.toString(), { basePath: '/api/auth' })) {
      return secure(
        await svelteKitHandler({ auth: event.locals.auth(), event, resolve, building }),
      );
    }
    return secure(await resolve(event));
  } finally {
    if (pool) waitUntil(pool.end());
  }
};
