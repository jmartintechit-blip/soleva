import { futureValue, ASSUMPTIONS_BP, type Plan } from '#lib/engine/compound.ts';

// Yearly points of the three scenarios, drawn as a line (base) over a band (prudente–optimista).
export function projectionPaths(plan: Omit<Plan, 'months'>, years: number, w: number, h: number) {
  const at = (bp: number) =>
    Array.from({ length: years + 1 }, (_, k) => futureValue({ ...plan, months: k * 12 }, bp));
  const lo = at(ASSUMPTIONS_BP.prudente);
  const mid = at(ASSUMPTIONS_BP.base);
  const hi = at(ASSUMPTIONS_BP.optimista);
  const max = hi[years]! * 1.08;
  const x = (k: number) => (k / years) * (w - 14) + 7;
  const y = (v: number) => h - 8 - (v / max) * (h - 20);
  const path = (a: number[]) =>
    a.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const back = lo
    .map((v, k) => [k, v] as const)
    .reverse()
    .map(([k, v]) => `L${x(k).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ');
  return {
    line: path(mid),
    band: `${path(hi)} ${back} Z`,
    end: { x: x(years), y: y(mid[years]!) },
    value: mid[years]!,
  };
}
