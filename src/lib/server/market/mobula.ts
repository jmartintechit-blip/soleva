import { madridToday } from '#lib/engine/day.ts';
import { type Fetch, type PriceProvider, fetchRetry, floatE8 } from './provider.ts';

// Crypto from Mobula (free plan, commercial use allowed by its terms per Juan). Its key goes in
// MOBULA_API_KEY; prices in USD, converted with the ECB rate like any other USD price.
export function mobula(apiKey: string, f: Fetch = fetch): PriceProvider {
  return {
    name: 'mobula',
    async closes(asset) {
      const res = await fetchRetry(
        f,
        `https://api.mobula.io/api/1/market/data?asset=${encodeURIComponent(asset)}`,
        { headers: { authorization: apiKey, accept: 'application/json' } },
      );
      if (!res.ok) throw new Error(`mobula ${asset}: ${res.status}`);
      const body = (await res.json()) as { data?: { price?: number } };
      const price = body.data?.price;
      if (!(typeof price === 'number' && price > 0)) throw new Error(`mobula ${asset}: no price`);
      // Crypto never closes: the price when the cron runs is that day's.
      return { currency: 'USD', closes: [{ day: madridToday(), priceE8: floatE8(price) }] };
    },
  };
}
