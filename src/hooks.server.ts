import { building, dev } from '$app/env';
import { Pool } from '@neondatabase/serverless';
import type { Handle } from '@sveltejs/kit/hooks';
import { env, waitUntil } from 'cloudflare:workers';
import { isAuthPath, svelteKitHandler } from 'better-auth/svelte-kit';
import { createAuth, type Auth } from '#lib/server/auth.ts';
import { sendOtpEmail } from '#lib/server/email.ts';

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
      sendOtp: async (email, otp) => {
        if (env.RESEND_API_KEY) return sendOtpEmail(env.RESEND_API_KEY, email, otp);
        if (dev) return console.log(`[dev] código para ${email}: ${otp}`);
        throw new Error('RESEND_API_KEY is not set');
      },
    }));
  try {
    if (isAuthPath(event.url.toString(), { basePath: '/api/auth' })) {
      return await svelteKitHandler({ auth: event.locals.auth(), event, resolve, building });
    }
    return await resolve(event);
  } finally {
    if (pool) waitUntil(pool.end());
  }
};
