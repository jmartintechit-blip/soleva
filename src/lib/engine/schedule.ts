import { addMonths, monthsBetween } from './dates.ts';
import { type Day, addDays, dayIn, daysBetween, monthOf, weekday } from './day.ts';

export type AutoFrequency =
  'semanal' | 'quincenal' | 'mensual' | 'trimestral' | 'anual' | 'una_vez';

export interface When {
  frequency: AutoFrequency;
  // semanal: ISO weekday; mensual and longer: day of the month (31 = the last); else none.
  day?: number;
  startOn: Day;
  endOn?: Day;
}

const MONTHS = { mensual: 1, trimestral: 3, anual: 12 } as const;

// The days a rule falls on after `from` and up to `to` (included), within its own start and end.
export function occurrences(w: When, from: Day, to: Day): Day[] {
  const first = w.startOn > from ? w.startOn : addDays(from, 1);
  const last = w.endOn && w.endOn < to ? w.endOn : to;
  if (first > last) return [];
  const out: Day[] = [];
  switch (w.frequency) {
    case 'una_vez':
      if (w.startOn >= first && w.startOn <= last) out.push(w.startOn);
      break;
    case 'semanal':
    case 'quincenal': {
      // Weekly on its weekday from the start; fortnightly every 14 days from the start itself.
      const step = w.frequency === 'semanal' ? 7 : 14;
      let d =
        w.frequency === 'semanal'
          ? addDays(w.startOn, (w.day! - weekday(w.startOn) + 7) % 7)
          : w.startOn;
      if (d < first) d = addDays(d, Math.ceil(daysBetween(d, first) / step) * step);
      for (; d <= last; d = addDays(d, step)) out.push(d);
      break;
    }
    default: {
      const step = MONTHS[w.frequency];
      const start = monthOf(w.startOn);
      let k = Math.max(0, Math.ceil(monthsBetween(start, monthOf(first)) / step) - 1) * step;
      for (
        let d = dayIn(addMonths(start, k), w.day!);
        d <= last;
        d = dayIn(addMonths(start, k), w.day!)
      ) {
        if (d >= first && d >= w.startOn) out.push(d);
        k += step;
      }
    }
  }
  return out;
}

// How many times a month it happens on average: a weekly plan is 52/12 a month.
export const perMonth = (f: AutoFrequency): number =>
  ({
    semanal: 52 / 12,
    quincenal: 26 / 12,
    mensual: 1,
    trimestral: 1 / 3,
    anual: 1 / 12,
    una_vez: 0,
  })[f];
