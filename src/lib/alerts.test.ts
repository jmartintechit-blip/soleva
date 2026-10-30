import { describe as group, expect, it } from 'vitest';
import { type StoredAlert, describe } from './alerts.ts';

const base = { id: 'x', accountId: 'acc', account: 'Bróker', instrument: null };

group('alert texts', () => {
  it('say the user’s own numbers and what to look at, never what to buy or sell', () => {
    const plan = describe(
      {
        ...base,
        kind: 'plan_supera',
        day: '2026-11-02',
        detail: {
          each: 36_000,
          frequency: 'semanal',
          spend: 156_000,
          inflow: 150_000,
          ruleId: 'r1',
        },
      } as StoredAlert,
      '2026-11-02',
    );
    expect(plan).toEqual({
      where: 'Bróker',
      title: 'Tu plan gasta más de lo que entra',
      body: 'De media salen 1.560 € al mes (360 € × 52 ÷ 12) y entran 1.500 €.',
      action: 'Ver el plan',
      href: '/reglas/r1',
    });
    expect(
      describe(
        {
          ...base,
          kind: 'compra_no_ejecutada',
          day: '2026-11-30',
          detail: { ruleId: 'r1', count: 2, cents: 12_000 },
        } as StoredAlert,
        '2026-11-30',
      ),
    ).toEqual({
      where: 'Bróker',
      title: 'Tu plan no compró: faltaba efectivo',
      body: 'El 30 de noviembre 2 compras quedaron sin hacer: hacían falta 120 € y no estaban en la cuenta. No se apuntó ninguna participación.',
      action: 'Ver el plan',
      href: '/reglas/r1',
    });
    const cash = describe(
      { ...base, kind: 'sin_saldo', day: '2027-01-02', detail: { cash: 14_210 } } as StoredAlert,
      '2026-11-02',
    );
    expect(cash.title).toBe('Esta cuenta se queda sin saldo en 2 meses');
    expect(cash.body).toBe('Tiene 142,10 € y, con tus reglas, el 2 de enero bajaría de cero.');
    expect(
      describe(
        { ...base, kind: 'sin_saldo', day: '2026-11-09', detail: { cash: -35_000 } } as StoredAlert,
        '2026-11-02',
      ),
    ).toMatchObject({
      title: 'Esta cuenta está en negativo',
      body: 'Tiene −350 €: con tus reglas sale más dinero del que entra.',
    });
    expect(
      describe(
        {
          ...base,
          kind: 'fin_promocion',
          day: '2026-12-31',
          detail: { afterRateBp: 50 },
        } as StoredAlert,
        '2026-12-01',
      ).body,
    ).toContain('(0,5 %)');
    const all = [plan, cash].map((t) => `${t.title} ${t.body} ${t.action}`).join(' ');
    expect(all).not.toMatch(/\b(compra|vende|cambia de|traspasa)\b/i);
  });
});
