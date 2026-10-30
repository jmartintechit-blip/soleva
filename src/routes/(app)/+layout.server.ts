import { redirect } from '@sveltejs/kit';
import { asTheme, THEME_COOKIE } from '#lib/labels.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, request, cookies }) => {
  const session = await locals.auth().api.getSession({ headers: request.headers });
  if (!session) redirect(303, '/entrar');
  // Open alerts, for the sidebar's counter and Inicio's bell.
  const [{ n }] = await locals
    .db()
    .query<{ n: number }>(
      `select count(*)::int as n from alert where user_id = $1 and state = 'abierta'`,
      [session.user.id],
    );
  return { email: session.user.email, theme: asTheme(cookies.get(THEME_COOKIE)), alerts: n };
};
