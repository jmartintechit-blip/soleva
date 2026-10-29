import { expect, test } from '@playwright/test';
import { EMAIL, resetUser, signIn, sql } from './auth.ts';

test('close the month: proposal, an inline correction, confirm once', async ({ page }) => {
  test.setTimeout(90_000);
  await resetUser();
  await signIn(page);
  const db = sql();
  const [{ id }] = await db`select id from "user" where email = ${EMAIL}`;
  const [cash] = await db`insert into money_account (user_id, name, kind, balance_cents)
    values (${id}, 'Banco', 'efectivo', 200000) returning id`;
  await db`insert into money_account (user_id, name, kind, balance_cents)
    values (${id}, 'Indexado', 'inversion', 1000000)`;
  await db`insert into rule (user_id, name, type, amount_cents, frequency, day, start_month, to_account_id)
    values (${id}, 'Nómina', 'entra', 150000, 'mensual', 1, '2020-01-01', ${cash!.id})`;

  await page.goto('/cierre');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: /^Cierre de / })).toBeVisible();
  await expect(page.getByText('+1.500,00 € por tus reglas')).toBeVisible();
  await expect(page.getByText('13.500,00 €')).toBeVisible();

  await page.getByText('Indexado', { exact: true }).click();
  await page.getByLabel('Saldo real de Indexado').fill('10.250');
  await expect(page.getByText('Corregido por ti')).toBeVisible();
  await expect(page.getByText('13.750,00 €')).toBeVisible();
  await page.getByRole('button', { name: 'Listo' }).last().click();
  await page.getByRole('button', { name: 'Confirmar saldos' }).click();

  await expect(page.getByRole('heading', { name: 'Saldos confirmados' })).toBeVisible();
  await expect(page.getByText('Tu primer mes cerrado')).toBeVisible();
  await expect(page.getByText('13.750 €')).toBeVisible();

  // The balances moved, and the next visit closes the following month (or nothing).
  await page.goto('/inicio');
  await expect(page.getByText('13.750 €')).toBeVisible();
  await page.goto('/cierre');
  await expect(page.getByText('Saldos confirmados')).toHaveCount(0);
});
