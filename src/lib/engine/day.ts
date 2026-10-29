import { type Month, daysInMonth } from './dates.ts';

// A civil day 'YYYY-MM-DD' in Europe/Madrid. The engine never sees hours or time zones: the
// server turns "now" into today's Madrid date once, and everything else is calendar arithmetic.
export type Day = string;

const toUtc = (d: Day) =>
  Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const fromUtc = (ms: number): Day => new Date(ms).toISOString().slice(0, 10);
const DAY_MS = 86_400_000;

export const addDays = (d: Day, n: number): Day => fromUtc(toUtc(d) + n * DAY_MS);
export const daysBetween = (from: Day, to: Day): number =>
  Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
export const monthOf = (d: Day): Month => d.slice(0, 7);
export const dayOfMonth = (d: Day): number => Number(d.slice(8, 10));
// ISO weekday: 1 = Monday … 7 = Sunday.
export const weekday = (d: Day): number => ((new Date(toUtc(d)).getUTCDay() + 6) % 7) + 1;
export const isWeekend = (d: Day): boolean => weekday(d) >= 6;
export const daysInYear = (d: Day): number =>
  daysInMonth(`${d.slice(0, 4)}-02`) === 29 ? 366 : 365;

// Day `day` of month `m`, clamped: the 31st of February is its last day.
export const dayIn = (m: Month, day: number): Day =>
  `${m}-${String(Math.min(day, daysInMonth(m))).padStart(2, '0')}`;

// Today in Madrid, for the server's edge. The engine itself only takes Days.
export const madridToday = (now = new Date()): Day =>
  now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

// Every day after `from` up to `to` included: the days a run has to generate.
export function* daysAfter(from: Day, to: Day): Generator<Day> {
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) yield d;
}
