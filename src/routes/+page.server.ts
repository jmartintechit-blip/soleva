import { error, fail } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { waitlistEmail } from '#lib/server/email.ts';
import { join } from '#lib/server/waitlist.ts';
import type { Actions, PageServerLoad } from './$types';

const Email = z.email().max(254);
// Closed until the legal notice and privacy policy are reviewed (parada 6).
const isOpen = () => env.WAITLIST_OPEN === '1';

export const load: PageServerLoad = () => ({ waitlistOpen: isOpen() });

export const actions: Actions = {
  unirse: async ({ request, locals, url }) => {
    if (!isOpen()) error(404);
    const form = await request.formData();
    const email = String(form.get('email') ?? '')
      .trim()
      .toLowerCase();
    if (!Email.safeParse(email).success) {
      return fail(400, { email, error: 'Escribe un email válido.' });
    }
    if (form.get('consent') !== 'on') {
      return fail(400, { email, error: 'Marca la casilla para poder escribirte.' });
    }
    const r = await join(locals.db(), email);
    if (r.status === 'busy') {
      return fail(429, { email, error: 'Hay mucha gente apuntándose. Prueba en un rato.' });
    }
    if (r.status === 'new') {
      const link = (accion: string) => new URL(`/lista/${accion}/${r.token}`, url).href;
      await locals.mail(waitlistEmail(email, link('confirmar'), link('baja')));
    }
    return { joined: true };
  },
};
