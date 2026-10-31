import { error, json } from '@sveltejs/kit';
import { placeOf, searchMunicipalities } from '#lib/server/property.ts';
import { requireUserId } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

// For RInmueble's municipality box: ?q= the matches, ?codigo= one's figures. Public data, but
// behind the session like the rest of the app.
export const GET: RequestHandler = async (event) => {
  await requireUserId(event);
  const db = event.locals.db();
  const code = event.url.searchParams.get('codigo') ?? '';
  if (code) {
    const info = /^\d{5}$/.test(code) ? await placeOf(db, code) : null;
    if (!info) error(404, 'No encontrado');
    return json(info);
  }
  return json(await searchMunicipalities(db, event.url.searchParams.get('q') ?? ''));
};
