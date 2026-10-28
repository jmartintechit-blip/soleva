import { expect, test } from '@playwright/test';

test('the calculator recalculates live and says it is an estimate', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const calc = page.locator('#calculadora');
  const result = calc.locator('[aria-live="polite"]');
  const tenYears = await result.textContent();

  await calc.getByRole('button', { name: '20 años' }).click();
  await expect(calc.getByRole('button', { name: '20 años' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(result).not.toHaveText(tenYears!);

  await calc.getByLabel('Lo que inviertes al mes').fill('0');
  await calc.getByLabel('Lo que tienes hoy').fill('0');
  await expect(result).toHaveText('0 €');
  await expect(calc).toContainText('Estimación, no asesoramiento');
});
