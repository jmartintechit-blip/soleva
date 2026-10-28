import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { postAuth } from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

const Email = z.email().max(254);
const Code = z.string().regex(/^\d{6}$/);

export const load: PageServerLoad = async ({ locals, request }) => {
  if (await locals.auth().api.getSession({ headers: request.headers })) redirect(303, '/inicio');
};

export const actions: Actions = {
  enviar: async (event) => {
    const form = await event.request.formData();
    const email = String(form.get('email') ?? '')
      .trim()
      .toLowerCase();
    if (!Email.safeParse(email).success) {
      return fail(400, { email, error: 'Escribe un email válido.' });
    }
    const res = await postAuth(event.locals.auth(), event, '/email-otp/send-verification-otp', {
      email,
      type: 'sign-in',
    });
    if (res.status === 429) {
      return fail(429, { email, error: 'Has pedido demasiados códigos. Prueba en unos minutos.' });
    }
    if (!res.ok)
      return fail(500, { email, error: 'No hemos podido enviar el código. Inténtalo otra vez.' });
    return { email, sent: true, error: '' };
  },

  verificar: async (event) => {
    const form = await event.request.formData();
    const email = String(form.get('email') ?? '');
    const otp = String(form.get('code') ?? '').replace(/\s/g, '');
    if (!Email.safeParse(email).success) return fail(400, { error: 'Vuelve a escribir tu email.' });
    if (!Code.safeParse(otp).success) {
      return fail(400, { email, sent: true, error: 'El código tiene 6 cifras.' });
    }
    const res = await postAuth(event.locals.auth(), event, '/sign-in/email-otp', { email, otp });
    if (res.status === 429) {
      return fail(429, {
        email,
        sent: true,
        error: 'Demasiados intentos. Prueba en unos minutos.',
      });
    }
    if (!res.ok) return fail(400, { email, sent: true, error: 'Código incorrecto o caducado.' });
    redirect(303, '/inicio');
  },
};
