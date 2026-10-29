import { type Day, addDays, daysBetween } from './day.ts';
import { roundHalfAwayFromZero } from './money.ts';

// Whole years from `from` to `on` (an anniversary counts as a full year).
export function wholeYears(from: Day, on: Day): number {
  let years = Number(on.slice(0, 4)) - Number(from.slice(0, 4));
  if (on.slice(5) < from.slice(5)) years--;
  return Math.max(0, years);
}

// Hacienda (Orden HAC/1501/2025): Anexo I value × the Anexo IV percentage for the whole years
// since first registration; past the table's last row, its last percentage. Steps once a year,
// as the official table does.
export function vehicleCents(
  baseCents: number,
  table: { yearsOver: number; pctBp: number }[],
  firstRegistration: Day,
  on: Day,
): number {
  const years = wholeYears(firstRegistration, on);
  const rows = [...table].sort((a, b) => a.yearsOver - b.yearsOver);
  const row = rows.findLast((r) => r.yearsOver <= years) ?? rows[0]!;
  return roundHalfAwayFromZero((baseCents * row.pctBp) / 10_000);
}

// Other goods: what is left of the price after n years per its curve (100 % at purchase), drawn
// straight between anniversaries so it drops a little every day; after the last row, flat.
export function assetCents(
  purchaseCents: number,
  curve: { years: number; pctBp: number }[],
  purchasedOn: Day,
  on: Day,
): number {
  const points = [{ years: 0, pctBp: 10_000 }, ...[...curve].sort((a, b) => a.years - b.years)];
  const years = wholeYears(purchasedOn, on);
  const i = points.findLastIndex((p) => p.years <= years);
  const a = points[i]!;
  const b = points[i + 1];
  let pct = a.pctBp;
  if (b) {
    const start = anniversary(purchasedOn, a.years);
    const end = anniversary(purchasedOn, b.years);
    pct += ((b.pctBp - a.pctBp) * daysBetween(start, on)) / daysBetween(start, end);
  }
  return roundHalfAwayFromZero((purchaseCents * pct) / 10_000);
}

// 29 February's anniversary in a common year is 28 February.
function anniversary(d: Day, years: number): Day {
  const y = Number(d.slice(0, 4)) + years;
  const candidate = `${y}${d.slice(4)}`;
  return d.slice(5) === '02-29' && addDays(`${y}-02-28`, 1).slice(5) !== '02-29'
    ? `${y}-02-28`
    : candidate;
}

// A product without a public price: each contribution grows at the user's yearly rate since its
// day (an estimate, and always shown as one).
export function estimateCents(
  contributions: { day: Day; cents: number }[],
  annualRateBp: number,
  on: Day,
): number {
  const r = 1 + annualRateBp / 10_000;
  return roundHalfAwayFromZero(
    contributions
      .filter((c) => c.day <= on)
      .reduce((s, c) => s + c.cents * r ** (daysBetween(c.day, on) / 365), 0),
  );
}
