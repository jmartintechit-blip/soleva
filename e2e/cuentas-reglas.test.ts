import { expect, test } from '@playwright/test';
import { hydrated, hydratedAfter, resetUser, signIn } from './auth.ts';

test('create accounts, a rule from its template, and pause it', async ({ page }) => {
  // Six pages that vite dev compiles cold in CI: past the default 30 s there.
  test.setTimeout(90_000);
  await resetUser();
  await signIn(page);

  await page.goto('/cuentas');
  await expect(page.getByText('Aún no tienes cuentas')).toBeVisible();
  // Links are followed client-side once hydrated; the form posts reload the page.
  await hydrated(page);
  await page.getByRole('link', { name: 'Nueva cuenta' }).click();
  await hydratedAfter(page, () => page.getByRole('button', { name: 'Crear cuenta' }).click());
  await expect(page.getByText('Ponle un nombre')).toBeVisible();

  await page.getByLabel('Nombre').fill('Banco');
  await page.getByLabel('Saldo o valor hoy').fill('1.250,50');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/cuentas$/);
  await expect(page.getByRole('link', { name: /^Banco/ }).getByText('1.250,50 €')).toBeVisible();

  await hydrated(page);
  await page.getByRole('link', { name: 'Nueva cuenta' }).click();
  await page.getByLabel('Nombre').fill('Indexado');
  await page.getByLabel('Tipo').selectOption('inversion');
  await page.getByLabel('Saldo o valor hoy').fill('5000');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('6.250,50 €')).toBeVisible();

  await page.goto('/reglas');
  await hydrated(page);
  await page.getByRole('link', { name: 'Nueva regla' }).click();
  await expect(page.getByLabel('Nombre')).toHaveValue('Aportación al fondo indexado');
  await expect(page.getByText(/Estimación, no asesoramiento/)).toBeVisible();
  await page.getByText('Entra', { exact: true }).click();
  await expect(page.getByLabel('Nombre')).toHaveValue('Nómina');
  await page.getByText('Se mueve', { exact: true }).click();
  await page.getByRole('button', { name: 'Crear regla' }).click();

  await expect(page).toHaveURL(/\/reglas\?creada$/);
  await expect(page.getByRole('status')).toHaveText('Regla creada');
  await expect(page.getByText('Banco → Indexado')).toBeVisible();
  const toggle = page.getByRole('switch');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'false');

  expect((await page.goto('/cuentas/no-es-mia'))!.status()).toBe(404);
  expect((await page.goto('/reglas/no-es-mia'))!.status()).toBe(404);
});
