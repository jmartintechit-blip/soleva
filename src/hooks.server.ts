import { building, dev } from '$app/env';
import { Pool } from '@neondatabase/serverless';
import type { Handle } from '@sveltejs/kit/hooks';
import { env, waitUntil } from 'cloudflare:workers';
import { isAuthPath, svelteKitHandler } from 'better-auth/svelte-kit';
import { createAuth } from '#lib/server/auth.ts';
import { sendOtpEmail } from '#lib/server/email.ts';

export const handle: Handle = async ({ event, resolve }) => {
  // Only auth routes touch the database for now; session guards arrive with the app layout.
  if (building || !isAuthPath(event.url.toString(), { basePath: '/api/auth' })) {
    return resolve(event);
  }
  // One pool per request: Workers cannot reuse sockets across requests.
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
  const auth = createAuth({
    pool,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: event.url.origin,
    sendOtp: async (email, otp) => {
      if (env.RESEND_API_KEY) return sendOtpEmail(env.RESEND_API_KEY, email, otp);
      if (dev) return console.log(`[dev] código para ${email}: ${otp}`);
      throw new Error('RESEND_API_KEY is not set');
    },
  });
  try {
    return await svelteKitHandler({ auth, event, resolve, building });
  } finally {
    waitUntil(pool.end());
  }
};
