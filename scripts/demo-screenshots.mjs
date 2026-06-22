#!/usr/bin/env node
// Captures the README "Vue d'ensemble" screenshots by logging in as each
// fixed test account and navigating to a fixed set of pages. Re-run after a
// UI change to refresh docs/images/*.png in place.
//
// Usage:
//   npm run dev                # in one terminal
//   npm run demo:screenshots   # in another, once the app responds
//
// Requires the 5 fixed *@pcivile.test accounts (npm run demo:create-test-accounts)
// and the seeded demo missions (npm run demo:setup) to already exist.
//
// Login helper duplicated (intentionally - see comment) from tests/e2e/helpers.ts.
// Keep both in sync if the login form changes.

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = process.env.E2E_BASE_URL || process.env.APP_BASE_URL || 'http://localhost:3000';
const PASSWORD = process.env.E2E_TEST_PASSWORD || 'DemoPass123!';
const OUT_DIR = path.join(repoRoot, 'docs', 'images');

function log(event, data = {}) {
  console.log(JSON.stringify({ event, ...data }));
}

async function login(page, email) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel('Identifiant').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/missions');
}

// One entry per README screenshot. Add a new shot by adding a line here.
const SHOTS = [
  { file: 'missions-liste-benevole.png', email: 'benevole@pcivile.test', path: '/missions' },
  {
    file: 'mission-detail-responsable.png',
    email: 'responsable@pcivile.test',
    path: '/missions?status=proposed',
    openFirstMission: true
  },
  { file: 'my-missions-benevole.png', email: 'benevole@pcivile.test', path: '/my-missions' },
  { file: 'admin-volunteers.png', email: 'admin@pcivile.test', path: '/admin/volunteers' }
];

async function main() {
  const browser = await chromium.launch();
  try {
    for (const shot of SHOTS) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await login(page, shot.email);
      await page.goto(`${BASE_URL}${shot.path}`);
      if (shot.openFirstMission) {
        await page.locator('a[href^="/missions/"]').first().click();
        await page.waitForURL('**/missions/*');
      }
      await page.waitForLoadState('networkidle');
      const outPath = path.join(OUT_DIR, shot.file);
      await page.screenshot({ path: outPath });
      log('captured', { file: shot.file, email: shot.email });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  log('done', { count: SHOTS.length });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
