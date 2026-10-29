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
    const cash = describe(
      { ...base, kind: 'sin_saldo', day: '2027-01-02', detail: { cash: 14_210 } } as StoredAlert,
      '2026-11-02',
    );
    expect(cash.title).toBe('Esta cuenta se queda sin saldo en 2 meses');
    expect(cash.body).toBe('Tiene 142,10 € y, con tus reglas, el 2 de enero bajaría de cero.');
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
