import { test, expect } from '@playwright/test';

const slackEmail = process.env.SLACK_TEST_EMAIL;
const slackPassword = process.env.SLACK_TEST_PASSWORD;
const slackWorkspaceUrl = process.env.SLACK_TEST_WORKSPACE_URL;

test('Slack SSO login redirects back authenticated', async ({ page, context, baseURL }) => {
  test.skip(!slackEmail || !slackPassword, 'SLACK_TEST_EMAIL and SLACK_TEST_PASSWORD are required');

  await test.step('Open login page and start Slack auth', async () => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /se connecter avec slack/i })).toBeVisible();
    await page.getByRole('button', { name: /se connecter avec slack/i }).click();
  });

  await test.step('Complete Slack OAuth flow', async () => {
    await page.waitForLoadState('domcontentloaded');

    if (slackWorkspaceUrl && page.url().includes('slack.com/signin')) {
      await page.fill('input[name="domain"]', slackWorkspaceUrl.replace(/^https?:\/\//, '').split('.')[0] ?? '');
      await page.getByRole('button', { name: /continue|suivant|next/i }).click();
    }

    if (await page.locator('input[type="email"], input[name="email"]').first().isVisible().catch(() => false)) {
      await page.locator('input[type="email"], input[name="email"]').first().fill(slackEmail!);
    }

    if (await page.locator('input[type="password"], input[name="password"]').first().isVisible().catch(() => false)) {
      await page.locator('input[type="password"], input[name="password"]').first().fill(slackPassword!);
    }

    const signInButton = page.getByRole('button', { name: /sign in|se connecter|continuer|continue/i }).first();
    if (await signInButton.isVisible().catch(() => false)) {
      await signInButton.click();
    }

    const allowButton = page.getByRole('button', { name: /allow|autoriser/i }).first();
    if (await allowButton.isVisible().catch(() => false)) {
      await allowButton.click();
    }
  });

  await test.step('Verify returned and authenticated session', async () => {
    await page.waitForURL((url) => !url.hostname.includes('slack.com'), { timeout: 90_000 });
    await expect(page).toHaveURL(/\/missions|\/profile|\/my-missions/);

    const cookies = await context.cookies(baseURL ? [baseURL] : undefined);
    const hasSupabaseCookie = cookies.some((cookie) => cookie.name.includes('sb-') || cookie.name.includes('supabase'));
    expect(hasSupabaseCookie).toBeTruthy();
  });
});
