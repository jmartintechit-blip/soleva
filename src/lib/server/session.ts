import { redirect } from '@sveltejs/kit';
import type { z } from 'zod';

// Every page and action of the app asks for the user here: no session, back to /entrar.
export async function requireUserId({ locals, request }: { locals: App.Locals; request: Request }) {
  const session = await locals.auth().api.getSession({ headers: request.headers });
  if (!session) redirect(303, '/entrar');
  return session.user.id;
}

// First message per field, for the form to show under each input.
export const fieldErrors = (error: z.ZodError) =>
  Object.fromEntries(
    [...error.issues].reverse().map((i) => [String(i.path[0] ?? 'form'), i.message]),
  ) as Record<string, string>;
