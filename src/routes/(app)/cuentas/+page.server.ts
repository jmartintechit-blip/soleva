import { listAccounts } from '#lib/server/accounts.ts';
import { requireUserId } from '#lib/server/session.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
  accounts: await listAccounts(event.locals.db(), await requireUserId(event)),
});
