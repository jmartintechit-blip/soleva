import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, request }) => {
  const session = await locals.auth().api.getSession({ headers: request.headers });
  if (!session) redirect(303, '/entrar');
  return { email: session.user.email };
};
