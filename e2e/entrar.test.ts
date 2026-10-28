import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { expect, test } from '@playwright/test';

// Resend's test sink, so a local run with a real key emails nobody. Must be in ALLOWED_EMAILS.
const EMAIL = 'delivered@resend.dev';
const CODE = '246810';

// The real code is only emailed (or logged), so swap the stored hash for one of a known code.
// Mirrors better-auth's email-otp storage: base64url(sha256(otp)) + ':' + attempts.
async function setCode(email: string, code: string) {
  const sql = neon(process.env.DATABASE_URL!);
  const hash = createHash('sha256').update(code).digest('base64url');
  const rows = await sql`update verification set value = ${`${hash}:0`}
    where identifier = ${`sign-in-otp-${email}`} returning id`;
  expect(rows).toHaveLength(1);
}

test('sign in with an email code and sign out', async ({ page }) => {
  // The test branch is a copy of dev: earlier local runs may have used up the code limit.
  await neon(process.env.DATABASE_URL!)`delete from "rateLimit"`;
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
