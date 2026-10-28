import { expect, test } from '@playwright/test';
import { CODE, EMAIL, setCode, sql } from './auth.ts';

test('sign in with an email code and sign out', async ({ page }) => {
  // The test branch is a copy of dev: earlier local runs may have used up the code limit.
  await sql()`delete from "rateLimit"`;
  await page.goto('/inicio');
  await expect(page).toHaveURL(/\/entrar$/);
  // vite dev hydrates late and resets what was typed before.
  await page.waitForLoadState('networkidle');

  await page.getByLabel('Email').fill(EMAIL);
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  await expect(page.getByRole('heading', { name: 'Revisa tu email' })).toBeVisible();

  await page.getByLabel('Código').fill('000000');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Código incorrecto o caducado.');

  await setCode(EMAIL, CODE);
  await page.getByLabel('Código').fill(CODE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/inicio$/);

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await page.goto('/inicio');
  await expect(page).toHaveURL(/\/entrar$/);
});
