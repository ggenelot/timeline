import { test, expect, type Page } from '@playwright/test';
import { login, TEST_USERS as USERS } from './helpers';

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

function isoDaysFromNow(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

test.describe.serial('P0 disponibilités longue durée (sans engagement)', () => {
  // Décalé dans le futur pour rester dans l'horizon (3 mois) et éviter les
  // jours passés (non peignables) — une nouvelle date à chaque exécution.
  const targetDay = isoDaysFromNow(14);

  test('1) bénévole peint un jour (pinceau 3 par défaut), persisté après rechargement', async ({ page }) => {
    await login(page, USERS.benevole);
    await page.goto('/availability');

    const cell = page.locator(`[data-testid="availability-day-cell"][data-day="${targetDay}"]`);
    await expect(cell).toBeVisible();
    await cell.click();
    await expect(page.getByText(/^1 jour renseigné/)).toBeVisible();

    await page.reload();
    await expect(page.locator(`[data-testid="availability-day-cell"][data-day="${targetDay}"]`)).toHaveClass(/bg-engage/);
  });

  test('2) responsable voit le score agrégé de ce jour', async ({ page }) => {
    await login(page, USERS.responsable);
    await page.goto('/admin/availability');

    const cell = page.locator(`[data-testid="availability-heatmap-cell"][data-day="${targetDay}"]`);
    await expect(cell).toBeVisible();
    await expect(cell).not.toContainText('·');
  });

  test('3) double-tap ouvre la feuille « Préciser » sans repeindre ni effacer le jour', async ({ page }) => {
    await login(page, USERS.benevole);
    await page.goto('/availability');

    // Jour déjà peint au niveau 3 (test 1, état sérialisé) avant le double-tap.
    const cell = page.locator(`[data-testid="availability-day-cell"][data-day="${targetDay}"]`);
    await expect(cell).toHaveClass(/bg-engage/);

    // Double-tap : ouvre la feuille sans changer l'état du jour.
    await cell.dblclick();
    await expect(page.locator('[data-testid="availability-precise-sheet"]')).toBeVisible();

    // Le jour n'a été ni repeint ni effacé.
    await expect(cell).toHaveClass(/bg-engage/);

    // Sélection d'un horaire « dès 13h » — autosave, pas de submit.
    await page.locator('[data-testid="availability-precise-sheet"]').getByRole('button', { name: '13h' }).click();
    await page.getByRole('button', { name: /C'est noté/ }).click();
    await expect(page.getByText(/1 précisé/)).toBeVisible();

    // Persistance de la précision après rechargement.
    await page.reload();
    await expect(page.getByText(/1 précisé/)).toBeVisible();
  });

  test('4) responsable voit la contrainte horaire dans le tooltip (score inchangé)', async ({ page }) => {
    await login(page, USERS.responsable);
    await page.goto('/admin/availability');

    const cell = page.locator(`[data-testid="availability-heatmap-cell"][data-day="${targetDay}"]`);
    await expect(cell).toBeVisible();
    await cell.hover();

    const tooltip = page.locator('[data-testid="availability-tooltip"]');
    await expect(tooltip).toBeVisible();
    // La contrainte est collée au nom, en bleu marque.
    await expect(tooltip).toContainText('(dès 13h)');
    // Le score agrégé ignore la contrainte : « N pts » cohérent avec la cellule.
    await expect(tooltip).toContainText(/\d+ pts/);
  });

  test('5) re-tap efface la déclaration et sa précision', async ({ page }) => {
    await login(page, USERS.benevole);
    await page.goto('/availability');

    const cell = page.locator(`[data-testid="availability-day-cell"][data-day="${targetDay}"]`);
    await cell.click();
    await expect(page.getByText(/^0 jour renseigné/)).toBeVisible();
    await expect(page.getByText(/précisé/)).toHaveCount(0);

    await page.reload();
    await expect(page.locator(`[data-testid="availability-day-cell"][data-day="${targetDay}"]`)).not.toHaveClass(/bg-engage/);
    await expect(page.getByText(/précisé/)).toHaveCount(0);
  });
});
