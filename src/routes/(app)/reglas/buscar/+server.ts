import { json } from '@sveltejs/kit';
import { searchProducts } from '#lib/server/market/search.ts';
import { requireUserId } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

// RPlan's «Añadir producto al plan»: one row per product, the euro listing first, in the
// provider's order (never ranked by us). The ISINs already found come with it.
export const GET: RequestHandler = async (event) => {
  await requireUserId(event);
  const q = (event.url.searchParams.get('q') ?? '').trim().slice(0, 60);
  const found = q ? await searchProducts(event.locals.db(), q).catch(() => null) : [];
  return json(found);
};
