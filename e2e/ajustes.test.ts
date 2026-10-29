import { expect, test } from '@playwright/test';
import { EMAIL, hydrated, hydratedAfter, resetUser, signIn, sql } from './auth.ts';

test('settings: theme, reminder, export everything and delete the account for real', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await resetUser();
  await signIn(page);
  const db = sql();
  const [{ id }] = await db`select id from "user" where email = ${EMAIL}`;
  await db`insert into money_account (user_id, name, kind, balance_cents)
    values (${id}, 'Banco', 'efectivo', 200000)`;

  await page.goto('/ajustes');
  await hydrated(page);

  // Theme: applied at once, painted by the server on reload, never on the public web.
  await page.getByRole('button', { name: 'Crepúsculo', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'crepusculo');
  await expect(page.getByRole('button', { name: 'Crepúsculo', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const html = await (await page.request.get('/ajustes')).text();
  expect(html).toContain('data-theme="crepusculo"');
  expect(await (await page.request.get('/')).text()).toContain('data-theme="amanecer"');
  // The same picker in the desktop sidebar.
  await page.goto('/inicio');
  await hydrated(page);
  await page.getByRole('button', { name: 'Tema Rosé' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'rose');
  await expect(page).toHaveURL(/inicio$/);
  await page.goto('/ajustes');
  await hydrated(page);

  // Reminder: off, day 15.
  await page.getByRole('switch', { name: /Avisarme por email/ }).uncheck();
  await page.getByLabel('Día del mes').selectOption('15');
  await page.getByRole('button', { name: 'Guardar recordatorio' }).click();
  await expect(page.getByText('Guardado')).toBeVisible();
  const [s] = await db`select reminder_enabled, reminder_day from settings where user_id = ${id}`;
  expect(s).toEqual({ reminder_enabled: false, reminder_day: 15 });

  // Export: everything in JSON, a table per CSV, nothing else.
  const json = await page.request.get('/ajustes/exportar/soleva.json');
  expect(json.headers()['content-disposition']).toMatch(/^attachment; filename="soleva-datos-/);
  const data = await json.json();
  expect(data.cuentas).toEqual([expect.objectContaining({ name: 'Banco', balance_cents: 200000 })]);
  expect(data.ajustes[0]).toMatchObject({ email: EMAIL, reminder_day: 15 });
  const body = await (await page.request.get('/ajustes/exportar/cuentas.csv')).body();
  expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM for Excel
  const csv = body.toString('utf8');
  expect(csv).toContain('id,name,kind,balance_cents');
  expect(csv).toContain(',Banco,efectivo,200000,');
  expect((await page.request.get('/ajustes/exportar/user.csv')).status()).toBe(404);

  // Delete: needs the word, then nothing of the user is left and the session is gone.
  await page.getByText('Borrar mi cuenta y todos mis datos').click();
  await hydratedAfter(page, () =>
    page.getByRole('button', { name: 'Borrar para siempre' }).click(),
  );
  await expect(page.getByText('Escribe BORRAR para confirmar').last()).toBeVisible();
  await page.getByLabel('Escribe BORRAR para confirmar').fill('borrar');
  await page.getByRole('button', { name: 'Borrar para siempre' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await db`select 1 from "user" where email = ${EMAIL}`).toHaveLength(0);
  expect(await db`select 1 from money_account where user_id = ${id}`).toHaveLength(0);
  expect(await db`select 1 from session where "userId" = ${id}`).toHaveLength(0);
  await page.goto('/inicio');
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'amanecer');
});
