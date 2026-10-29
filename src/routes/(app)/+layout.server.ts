import { redirect } from '@sveltejs/kit';
import { asTheme, THEME_COOKIE } from '#lib/labels.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, request, cookies }) => {
  const session = await locals.auth().api.getSession({ headers: request.headers });
  if (!session) redirect(303, '/entrar');
  return { email: session.user.email, theme: asTheme(cookies.get(THEME_COOKIE)) };
};
