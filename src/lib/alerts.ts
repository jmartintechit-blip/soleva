import { formatEuros } from '#lib/engine/money.ts';

// What an alert says, from its stored numbers: about the user's own plan, never what to buy, sell
// or switch to (CNMV red line). Shared by Alertas, Inicio and the sidebar.
export interface StoredAlert {
  id: string;
  kind: 'sin_saldo' | 'plan_supera' | 'fin_promocion' | 'precio_viejo' | 'compra_no_ejecutada';
  day: string;
  accountId: string | null;
  account: string | null;
  instrument: string | null;
  detail: Record<string, number | string>;
}

const eur = (cents: unknown) => formatEuros(Number(cents), { withCents: true });
const date = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
const PER_MONTH: Record<string, string> = {
  semanal: ' × 52 ÷ 12',
  quincenal: ' × 26 ÷ 12',
  trimestral: ' ÷ 3',
  anual: ' ÷ 12',
};

export function describe(a: StoredAlert, today: string) {
  const d = a.detail;
  switch (a.kind) {
    case 'plan_supera':
      return {
        where: a.account ?? '',
        title: 'Tu plan gasta más de lo que entra',
        body: `De media salen ${eur(d.spend)} al mes (${eur(d.each)}${PER_MONTH[String(d.frequency)] ?? ''}) y entran ${eur(d.inflow)}.`,
        action: 'Ver el plan',
        href: `/reglas/${d.ruleId}`,
      };
    case 'sin_saldo': {
      if (Number(d.cash) < 0)
        return {
          where: a.account ?? '',
          title: 'Esta cuenta está en negativo',
          body: `Tiene ${eur(d.cash)}: con tus reglas sale más dinero del que entra.`,
          action: 'Ver la cuenta',
          href: `/cuentas/${a.accountId}`,
        };
      const months = Math.max(
        0,
        Math.round((Date.parse(a.day) - Date.parse(today)) / (30.44 * 86_400_000)),
      );
      return {
        where: a.account ?? '',
        title:
          months >= 2
            ? `Esta cuenta se queda sin saldo en ${months} meses`
            : `Esta cuenta se queda sin saldo el ${date(a.day)}`,
        body: `Tiene ${eur(d.cash)} y, con tus reglas, el ${date(a.day)} bajaría de cero.`,
        action: 'Ver la cuenta',
        href: `/cuentas/${a.accountId}`,
      };
    }
    case 'compra_no_ejecutada':
      return {
        where: a.account ?? '',
        title: 'Tu plan no compró: faltaba efectivo',
        body: `El ${date(a.day)} ${Number(d.count) === 1 ? 'una compra quedó' : `${d.count} compras quedaron`} sin hacer: hacían falta ${eur(d.cents)} y no estaban en la cuenta. No se apuntó ninguna participación.`,
        action: 'Ver el plan',
        href: `/reglas/${d.ruleId}`,
      };
    case 'fin_promocion':
      return {
        where: a.account ?? '',
        title: `Tu tipo promocional termina el ${date(a.day)}`,
        body: `Desde el día siguiente, Soleva calculará con el tipo que indicaste después (${String(Number(d.afterRateBp) / 100).replace('.', ',')} %).`,
        action: 'Revisar el tipo',
        href: `/cuentas/${a.accountId}`,
      };
    case 'precio_viejo':
      return {
        where: a.account ?? '',
        title: 'Un precio lleva días sin actualizarse',
        body: `${a.instrument ?? 'Un producto'}: último precio del ${date(a.day)}. Puedes ponerlo tú o esperar a que vuelva.`,
        action: 'Poner precio',
        href: `/cuentas/${a.accountId}`,
      };
  }
}
