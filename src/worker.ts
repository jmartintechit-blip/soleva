// The deployed worker: SvelteKit's for requests, plus the daily cron for close reminders.
// Built by the adapter (kit.wrangler.jsonc): missing until the first build, so no types before it.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import kit from '../.svelte-kit/cloudflare/_worker.js';
import { createNeonDb } from '#lib/server/db/index.ts';
import { sendEmail } from '#lib/server/email.ts';
import { today } from '#lib/server/plan.ts';
import { sendReminders } from '#lib/server/reminders.ts';

export default {
  fetch: kit.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const db = createNeonDb(env.DATABASE_URL);
    try {
      const sent = await sendReminders(db, today(), 'https://solevaapp.com', (email) =>
        sendEmail(env.RESEND_API_KEY, email),
      );
      console.log(`reminders sent: ${sent}`);
    } finally {
      ctx.waitUntil(db.close());
    }
  },
};
