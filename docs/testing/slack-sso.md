# Test E2E Slack SSO

## Prérequis
- Déployer l'app avec les secrets Vercel configurés (`SLACK_TEST_EMAIL`, `SLACK_TEST_PASSWORD`, `SLACK_TEST_WORKSPACE_URL`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_BOT_TOKEN`, `SLACK_OAUTH_REDIRECT_URI`, `APP_BASE_URL`).
- Exporter localement les mêmes variables d'environnement avant de lancer les commandes.

## Commandes
- Diagnostic OAuth: `pnpm diagnose:slack-oauth`
- Test E2E Slack SSO: `pnpm test:e2e:slack-sso`

## Ce que vérifie le diagnostic
1. Présence de la configuration d'environnement Slack/OAuth.
2. Réponse de `/api/auth/slack/start` et validité du `oauthUrl` (host/path/query/redirect_uri).
3. Disponibilité de `/api/auth/slack/callback`.
4. Réponse Slack `auth.test` via `SLACK_BOT_TOKEN`.
5. Indication de vérification de la liaison Supabase (`slack_identities`).

## Ce que vérifie le test E2E
1. Ouvre `/login`.
2. Clique sur **Se connecter avec Slack**.
3. Passe le flux réel Slack OAuth (email/mot de passe + consentement si demandé).
4. Vérifie le retour sur l'application et la présence d'une session connectée (URL app + cookie Supabase).

## Boucle d'auto-évaluation conseillée
1. `pnpm diagnose:slack-oauth`
2. `pnpm test:e2e:slack-sso`
3. Si échec: analyser les logs structurés serveur (`[slack-auth-start]`, `[slack-auth-callback]`, `[slack-oauth-state]`) puis corriger.
4. Relancer diagnostic + test jusqu'à succès.
