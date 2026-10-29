// Amounts are integer cents; rates are basis points (600 = 6 %).

// Half away from zero, so −0,5 and 0,5 round the same way in absolute terms.
export function roundHalfAwayFromZero(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

// 'always': es-ES leaves 4-digit numbers ungrouped by default (1234 instead of 1.234).
const whole = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' });
const exact = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always',
});

// 1240000 → "12.400 €"; with cents, only when there are any: 125050 → "1.250,50 €",
// 125000 → "1.250 €". Negatives keep their sign: "−3 €".
export function formatEuros(cents: number, { withCents = false } = {}): string {
  const exactly = withCents && cents % 100 !== 0;
  const euros = exactly ? cents / 100 : roundHalfAwayFromZero(cents / 100);
  const text = (exactly ? exact : whole).format(Math.abs(euros));
  return `${euros < 0 ? '−' : ''}${text} €`;
}

// "1.250,50", "1250,5", "12.5" or "1.250" (thousands) → cents; null if it is not an amount.
// Two or fewer digits after the only separator make it a decimal one.
function parseDecimal(text: string): number | null {
  let s = text.replace(/[\s€%]/g, '').replace('−', '-');
  const sign = s.startsWith('-') ? -1 : 1;
  s = s.replace(/^[-+]/, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return sign * (Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')));
}

export const parseEuros = parseDecimal;
// "6", "6,5" or "−15" (%) → basis points.
export const parsePercent = parseDecimal;
