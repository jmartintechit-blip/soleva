// Units, prices and exchange rates are integers scaled by 10^8 (_e8) and money is integer cents.
// Everything is BigInt in between, with one rounding at the end, so no float ever touches it.

export const E8 = 100_000_000n;

// Half away from zero for BigInt division: 5 / 2 → 3, −5 / 2 → −3.
export function divRound(n: bigint, d: bigint): bigint {
  const q = n / d;
  const r = n % d;
  return 2n * (r < 0n ? -r : r) >= (d < 0n ? -d : d) ? q + (n < 0n === d < 0n ? 1n : -1n) : q;
}

// What `qty` units at `price` (in the instrument's currency) are worth in euro cents, with the
// ECB rate `perEur` (units of that currency per euro; 10^8 for euros).
export function valueCents(qtyE8: bigint, priceE8: bigint, perEurE8: bigint = E8): number {
  // qty·price is in currency·10^16; ×100 for cents, ÷perEur·10^8 back to euros.
  return Number(divRound(qtyE8 * priceE8 * 100n, E8 * perEurE8));
}

// Units bought with `cents` euros at `price`: rounded down, a broker never hands out more than
// the money pays for.
export function unitsFor(cents: number, priceE8: bigint, perEurE8: bigint = E8): bigint {
  return (BigInt(cents) * perEurE8 * E8) / (100n * priceE8);
}

// "12.5" or 12.5 → 1250000000n, for tests and the edge: at most 8 decimals, exact.
export function toE8(x: string | number): bigint {
  const s = typeof x === 'number' ? x.toFixed(8) : x;
  const neg = s.startsWith('-');
  const [int = '0', frac = ''] = s.replace('-', '').split('.');
  const v = BigInt(int) * E8 + BigInt((frac + '00000000').slice(0, 8));
  return neg ? -v : v;
}

// "114,7987", "1.250,5" or "0.5" → units ×10^8 (at most 8 decimals); null if it is not a number.
export function parseUnits(text: string): bigint | null {
  let s = text.replace(/\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const m = /^(\d{1,10})(?:\.(\d{1,8}))?$/.exec(s);
  if (!m) return null;
  return BigInt(m[1]!) * E8 + BigInt((m[2] ?? '').padEnd(8, '0'));
}

// Units shown to people: at most 6 decimals (UNIT_STEP is the smallest one), the Spanish way,
// without trailing zeros: 11479870000n → "114,7987".
export const UNIT_STEP = 100n;
export function unitsText(qtyE8: bigint): string {
  const abs = divRound(qtyE8 < 0n ? -qtyE8 : qtyE8, UNIT_STEP);
  const frac = (abs % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${qtyE8 < 0n && abs > 0n ? '−' : ''}${abs / 1_000_000n}${frac ? `,${frac}` : ''}`;
}
