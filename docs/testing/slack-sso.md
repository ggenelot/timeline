# Test E2E Slack SSO

## Objectif
Automatiser l'auto-évaluation des PR Codex avec un pipeline GitHub Actions dédié au flux Slack SSO, sans stocker de secrets dans le dépôt.

## Workflows GitHub Actions

### 1) `.github/workflows/slack-sso-e2e.yml`
Exécuté sur les événements `pull_request` (hors draft), il enchaîne :
1. `pnpm install --frozen-lockfile`
2. `pnpm lint`
3. `pnpm test`
4. `pnpm diagnose:slack-oauth`
5. `pnpm test:e2e:slack-sso`

Le workflow installe aussi Chromium pour Playwright.

### 2) `.github/workflows/auto-merge.yml` (optionnel)
Active l'auto-merge (squash) uniquement si :
- la PR ressemble à une PR Codex (auteur/login/head branch/titre),
- la PR n'est pas en draft,
- la PR n'a pas le label `do-not-merge`.

> GitHub n'exécutera le merge automatique qu'une fois les checks obligatoires validés.

## Variables à configurer

Aucune clé n'est commitée dans le repo. Configurer uniquement via **GitHub Actions Secrets/Variables** (et éventuellement synchroniser avec Vercel selon votre déploiement) :

### Secrets GitHub
- `SLACK_TEST_EMAIL`
- `SLACK_TEST_PASSWORD`
- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_BOT_TOKEN`

### Variables GitHub (`vars`)
- `E2E_BASE_URL`
- `APP_BASE_URL`
- `SLACK_TEST_WORKSPACE_URL`
- `SLACK_OAUTH_REDIRECT_URI`

## Scripts npm attendus
- `pnpm lint`
- `pnpm test`
- `pnpm diagnose:slack-oauth`
- `pnpm test:e2e:slack-sso`

## Exécution locale
1. Exporter les mêmes variables/secrets dans votre shell.
2. Lancer :
   - `pnpm install`
   - `pnpm lint`
   - `pnpm test`
   - `pnpm diagnose:slack-oauth`
   - `pnpm test:e2e:slack-sso`
