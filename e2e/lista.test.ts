import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { expect, test } from '@playwright/test';

// Resend's test sink, so a local run with a real key emails nobody. Needs WAITLIST_OPEN=1.
const EMAIL = 'delivered@resend.dev';
const TOKEN = 'e2e-token';

test('join the waiting list, confirm and leave', async ({ page }) => {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`delete from waitlist where email = ${EMAIL}`;

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Tu correo').fill(EMAIL);
  await page.getByRole('button', { name: 'Quiero probarla' }).click();
  // The browser blocks the submit until consent is given.
  await expect(page.getByRole('status')).toHaveCount(0);
  // And the server refuses it too, without saving the email.
  const noConsent = await page.request.post('/?/unirse', {
    form: { email: EMAIL },
    headers: { origin: 'http://localhost:5173' },
  });
  expect(noConsent.status()).toBe(400);
  expect(await noConsent.text()).toContain('Marca la casilla');
  expect(await sql`select 1 from waitlist where email = ${EMAIL}`).toHaveLength(0);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Quiero probarla' }).click();
  await expect(page.getByRole('status')).toContainText('Revisa tu email');

  // The real link is only emailed (or logged), so give the row a token we know.
  const hash = createHash('sha256').update(TOKEN).digest('base64url');
  await sql`update waitlist set token_hash = ${hash} where email = ${EMAIL}`;

  await page.goto(`/lista/confirmar/${TOKEN}`);
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('heading', { name: 'Estás dentro' })).toBeVisible();
  const [row] = await sql`select confirmed_at from waitlist where email = ${EMAIL}`;
  expect(row!.confirmed_at).not.toBeNull();

  await page.goto(`/lista/baja/${TOKEN}`);
  await page.getByRole('button', { name: 'Salir de la lista' }).click();
  await expect(page.getByRole('heading', { name: 'Te hemos borrado' })).toBeVisible();
  expect(await sql`select 1 from waitlist where email = ${EMAIL}`).toHaveLength(0);

  await page.goto(`/lista/baja/${TOKEN}`);
  await page.getByRole('button', { name: 'Salir de la lista' }).click();
  await expect(page.getByRole('heading', { name: 'Este enlace ya no vale' })).toBeVisible();
});
