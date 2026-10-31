import { expect, test } from '@playwright/test';
import { openAccount } from '../src/lib/server/alta.ts';
import { createNeonDb } from '../src/lib/server/db/index.ts';
import { runUser } from '../src/lib/server/engine-run.ts';
import { migrateUserToLedger } from '../src/lib/server/ledger-migration.ts';
import { today } from '../src/lib/server/plan.ts';
import { EMAIL, hydrated, resetUser, signIn, sql } from './auth.ts';

test('RDeuda: a mortgage from the Alta gets its terms, its next payment and its schedule', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await resetUser();
  await signIn(page);
  const [{ id }] = await sql()`select id from "user" where email = ${EMAIL}`;
  const db = createNeonDb(process.env.DATABASE_URL!);
  let loan: string;
  try {
    await migrateUserToLedger(db, id, today());
    await openAccount(db, id, today(), { name: 'Bankinter', kind: 'efectivo', cents: 500_000 });
    loan = await openAccount(db, id, today(), {
      name: 'Hipoteca del piso',
      kind: 'deuda_hipoteca',
      cents: 14_000_000,
    });
    await runUser(db, id, today());
  } finally {
    await db.close();
  }

  await page.goto(`/cuentas/${loan}`);
  await expect(page).toHaveURL(new RegExp(`/cuentas/${loan}/deuda$`));
  await hydrated(page);
  await expect(page.getByText(/Pon las condiciones de tu hipoteca/)).toBeVisible();
  await page.getByLabel('Capital inicial').fill('150.000');
  await page.getByLabel('Mes de la firma').fill('2024-07');
  await page.getByLabel('Años').fill('25');
  await page.getByLabel('Tipo fijo (%)').fill('2,6');
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(page.getByText(/^Próxima cuota · /)).toBeVisible();
  await expect(page.getByText('680,50 €')).toBeVisible();
  await expect(page.getByText(/^Devuelto: .* de 150\.000 €/)).toBeVisible();
  await expect(page.getByText('Sale de Bankinter el día 1. Lo apunta Soleva sola.')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.getByRole('button', { name: /^Ver las \d+ cuotas$/ }).click();
  expect(await page.locator('tbody tr').count()).toBeGreaterThan(200);
});
