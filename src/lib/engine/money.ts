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

// 1240000 → "12.400 €"; with cents: 125050 → "1.250,50 €". Negatives keep their sign: "−3 €".
export function formatEuros(cents: number, { withCents = false } = {}): string {
  const euros = withCents ? cents / 100 : roundHalfAwayFromZero(cents / 100);
  const text = (withCents ? exact : whole).format(Math.abs(euros));
  return `${euros < 0 ? '−' : ''}${text} €`;
}
