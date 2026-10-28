import { error } from '@sveltejs/kit';
import { confirm, leave } from '#lib/server/waitlist.ts';
import type { Actions, PageServerLoad } from './$types';

// GET only shows a button: mail scanners open links, and must not confirm or unsubscribe anyone.
export const load: PageServerLoad = ({ params }) => {
  if (params.accion !== 'confirmar' && params.accion !== 'baja') error(404);
  return { accion: params.accion };
};

export const actions: Actions = {
  default: async ({ params, locals }) => {
    const db = locals.db();
    if (params.accion === 'confirmar') return { done: await confirm(db, params.token) };
    if (params.accion === 'baja') return { done: await leave(db, params.token) };
    error(404);
  },
};
