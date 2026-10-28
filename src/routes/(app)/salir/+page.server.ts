import { redirect } from '@sveltejs/kit';
import { postAuth } from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => redirect(303, '/inicio');

export const actions: Actions = {
  default: async (event) => {
    await postAuth(event.locals.auth(), event, '/sign-out', {});
    redirect(303, '/entrar');
  },
};
