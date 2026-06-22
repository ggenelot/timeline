import type { Page } from '@playwright/test';

// Shared with scripts/demo-screenshots.mjs (duplicated there as a plain .mjs
// since that script runs via `node`, not the Playwright test runner - keep
// both in sync if the login form changes).

export const E2E_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'DemoPass123!';

export const TEST_USERS = {
  admin: 'admin@pcivile.test',
  responsable: 'responsable@pcivile.test',
  benevole: 'benevole@pcivile.test',
  benevole2: 'benevole2@pcivile.test',
  benevole3: 'benevole3@pcivile.test'
} as const;

export async function login(page: Page, email: string, password = E2E_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Identifiant').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/missions');
}
