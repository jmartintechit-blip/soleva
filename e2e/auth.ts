import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { type Page, expect } from '@playwright/test';

// Resend's test sink, so a local run with a real key emails nobody. Must be in ALLOWED_EMAILS.
export const EMAIL = 'delivered@resend.dev';
export const CODE = '246810';
export const sql = () => neon(process.env.DATABASE_URL!);

// The real code is only emailed (or logged), so swap the stored hash for one of a known code.
// Mirrors better-auth's email-otp storage: base64url(sha256(otp)) + ':' + attempts.
export async function setCode(email: string, code: string) {
  const hash = createHash('sha256').update(code).digest('base64url');
  const rows = await sql()`update verification set value = ${`${hash}:0`}
    where identifier = ${`sign-in-otp-${email}`} returning id`;
  expect(rows).toHaveLength(1);
}

// A clean start: deleting the user cascades to everything (confirmed closes can't be deleted alone).
export const resetUser = () => sql()`delete from "user" where email = ${EMAIL}`;

export async function signIn(page: Page) {
  // The test branch is a copy of dev: earlier local runs may have used up the code limit.
  await sql()`delete from "rateLimit"`;
  await page.goto('/entrar');
  // vite dev hydrates late and resets what was typed before.
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  await expect(page.getByRole('heading', { name: 'Revisa tu email' })).toBeVisible();
  await setCode(EMAIL, CODE);
  await page.getByLabel('Código').fill(CODE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}
