import { test, expect, type Page } from '@playwright/test';

const PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'DemoPass123!';

const USERS = {
  admin: 'admin@pcivile.test',
  responsable: 'responsable@pcivile.test',
  benevole: 'benevole@pcivile.test'
} as const;

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/missions');
}

async function openFirstProposedMission(page: Page) {
  await page.goto('/missions?status=proposed');
  const firstMissionLink = page.locator('a[href^="/missions/"]').first();
  await expect(firstMissionLink).toBeVisible();
  const href = await firstMissionLink.getAttribute('href');
  expect(href).toBeTruthy();
  await firstMissionLink.click();
  await page.waitForURL('**/missions/*');
  return href!;
}

test.describe.serial('P0 non-régression missions', () => {
  test('1) login admin, responsable, bénévole', async ({ browser }) => {
    for (const email of [USERS.admin, USERS.responsable, USERS.benevole]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await login(page, email);
      await expect(page).toHaveURL(/\/missions/);
      await context.close();
    }
  });

  test('2) liste missions: recherche + filtres + visibilité bénévole (proposed uniquement)', async ({ page }) => {
    await login(page, USERS.benevole);
    await page.goto('/missions');

    const draftBadge = page.getByText('Brouillon');
    await expect(draftBadge).toHaveCount(0);

    await page.getByRole('button', { name: /Proposé/i }).first().click();
    await page.getByPlaceholder('Rechercher une mission').fill('zzzz-introuvable');
    await expect(page.getByText(/Aucune mission/i)).toBeVisible();
  });

  test('3) bénévole répond available/unavailable sur mission proposed', async ({ page }) => {
    await login(page, USERS.benevole);
    await openFirstProposedMission(page);

    await page.getByRole('button', { name: 'Disponible' }).first().click();
    await expect(page.getByText(/Réponse enregistrée/i)).toBeVisible();

    await page.getByRole('button', { name: 'Indisponible' }).first().click();
    await expect(page.getByText(/Réponse enregistrée/i)).toBeVisible();
  });

  test('4-5-6) admin sélectionne/retire, confirme, vérifie my-missions et historique', async ({ page }) => {
    await login(page, USERS.admin);
    const missionPath = await openFirstProposedMission(page);

    await page.getByRole('button', { name: /Disponibilités bénévoles/i }).click();

    const volunteerRow = page.getByRole('row').filter({ hasText: 'benevole@pcivile.test' }).first();
    await expect(volunteerRow).toBeVisible();
    await volunteerRow.getByRole('button', { name: 'Disponible' }).click();
    await expect(page.getByText(/Disponibilité mise à jour/i)).toBeVisible();

    await page.getByRole('button', { name: /Sélection de l'équipage|Sélection de l’équipage/i }).click();
    const selectButton = page.getByRole('button', { name: /Retenir comme/i }).first();
    await expect(selectButton).toBeVisible();
    await selectButton.click();
    await expect(page.getByText(/Sélection de l’équipage mise à jour|Sélection de l'équipage mise à jour/i)).toBeVisible();

    const removeButton = page.getByRole('button', { name: /Retirer/i }).first();
    await expect(removeButton).toBeVisible();
    await removeButton.click();
    await expect(page.getByText(/Sélection de l’équipage mise à jour|Sélection de l'équipage mise à jour/i)).toBeVisible();

    await selectButton.click();
    await expect(page.getByText(/Sélection de l’équipage mise à jour|Sélection de l'équipage mise à jour/i)).toBeVisible();

    await page.getByRole('button', { name: /Confirmer la sélection de l'équipage/i }).click();
    await expect(page.getByText(/Mission confirmée/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Retenir comme/i })).toHaveCount(0);

    await page.goto('/my-missions');
    const missionTitle = await page.locator('article h2').first().textContent();
    expect(missionTitle?.trim().length).toBeTruthy();

    await page.goto(missionPath);
    await page.getByRole('button', { name: /Historique/i }).click();
    await expect(page.getByText(/Réponse/i)).toBeVisible();
    await expect(page.getByText(/Retenu/i)).toBeVisible();
    await expect(page.getByText(/Retiré/i)).toBeVisible();
  });
});
