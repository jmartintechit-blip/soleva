import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
import { parseSetCookieHeader, toCookieOptions } from 'better-auth/cookies';

export interface AuthConfig {
  // pg-compatible pool: Neon's Pool in the worker, PGlite's shim in tests.
  pool: { connect: () => Promise<unknown> };
  secret: string;
  baseURL: string;
  sendOtp: (email: string, otp: string) => Promise<void>;
  // Closed registration: only these emails get a code or an account. Undefined = open.
  allowedEmails?: string[];
}

// Sign-in is only by one-time code: no passwords to hash (Workers Free has 10 ms of CPU) or leak.
export function createAuth({ pool, secret, baseURL, sendOtp, allowedEmails }: AuthConfig) {
  const allowed = (email: string) => !allowedEmails || allowedEmails.includes(email.toLowerCase());
  return betterAuth({
    database: pool as never,
    secret,
    baseURL,
    telemetry: { enabled: false },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    rateLimit: {
      enabled: true,
      storage: 'database',
      customRules: {
        '/email-otp/send-verification-otp': { window: 600, max: 3 },
        '/sign-in/email-otp': { window: 600, max: 10 },
      },
    },
    databaseHooks: {
      user: { create: { before: async (user) => allowed(user.email) } },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 3,
        storeOTP: 'hashed',
        // Same answer for any email, so the form does not reveal who is allowed.
        sendVerificationOTP: async ({ email, otp }) => {
          if (allowed(email)) await sendOtp(email, otp);
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

interface FormEvent {
  url: URL;
  request: Request;
  cookies: { set: (name: string, value: string, opts: { path: string }) => void };
}

// Form actions go through auth.handler, not auth.api: only the HTTP router applies rate limits.
export async function postAuth(auth: Auth, event: FormEvent, path: string, body: unknown) {
  const ip = event.request.headers.get('cf-connecting-ip');
  const res = await auth.handler(
    new Request(new URL(`/api/auth${path}`, event.url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: event.url.origin,
        cookie: event.request.headers.get('cookie') ?? '',
        ...(ip && { 'cf-connecting-ip': ip }),
      },
      body: JSON.stringify(body),
    }),
  );
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    for (const [name, attrs] of parseSetCookieHeader(setCookie)) {
      event.cookies.set(name, attrs.value, { ...toCookieOptions(attrs), path: attrs.path || '/' });
    }
  }
  return res;
}
