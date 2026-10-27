import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';

export interface AuthConfig {
  // pg-compatible pool: Neon's Pool in the worker, PGlite's shim in tests.
  pool: { connect: () => Promise<unknown> };
  secret: string;
  baseURL: string;
  sendOtp: (email: string, otp: string) => Promise<void>;
}

// Sign-in is only by one-time code: no passwords to hash (Workers Free has 10 ms of CPU) or leak.
export function createAuth({ pool, secret, baseURL, sendOtp }: AuthConfig) {
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
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 3,
        storeOTP: 'hashed',
        sendVerificationOTP: ({ email, otp }) => sendOtp(email, otp),
      }),
    ],
  });
}
