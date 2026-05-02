# Slack Auth manual test plan

## Objectif
Vérifier que le login Slack OpenID utilise `openid.connect.token` + `openid.connect.userInfo`, alors que la liaison de compte Slack existante continue d'utiliser `oauth.v2.access`.

## Pré-requis
- Variables d'environnement Slack configurées (`SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, redirect URIs).
- Un utilisateur Timeline lié dans `slack_identities`.
- Un utilisateur Slack du mauvais workspace pour tester `workspace_not_allowed`.

## Cas de test
1. **Login Slack nominal (OpenID)**
   - Aller sur `/login` puis cliquer "Se connecter avec Slack".
   - Vérifier dans les logs backend:
     - `state consumed`
     - `OpenID token obtained`
     - `OpenID userInfo obtained`
     - `resolved Slack identity`
     - `Timeline mapping found`
     - `magic link generated`
   - Vérifier la redirection vers un lien magic link Supabase puis `/missions`.

2. **Erreur provider Slack**
   - Simuler un callback avec `?error=access_denied`.
   - Vérifier redirection: `/login?slack=auth_failed&reason=slack_provider_error`.

3. **Code/state manquants**
   - Simuler callback sans `code` ou sans `state`.
   - Vérifier redirection: `/login?slack=auth_failed&reason=missing_code_or_state`.

4. **State invalide/expiré**
   - Rejouer un `state` déjà consommé.
   - Vérifier redirection: `/login?slack=auth_failed&reason=invalid_or_expired_state`.

5. **Token OpenID impossible**
   - Forcer un `client_secret` invalide.
   - Vérifier redirection: `/login?slack=auth_failed&reason=openid_token_exchange_failed`.
   - Vérifier logs structurés avec `endpoint`, `status`, `error`, `hasClientId`, `hasClientSecret`, `redirectUri`.
   - Vérifier absence de secrets/tokens/codes dans les logs.

6. **UserInfo OpenID impossible**
   - Forcer un `access_token` invalide (mock ou interception).
   - Vérifier redirection: `/login?slack=auth_failed&reason=openid_userinfo_failed`.

7. **Identity non liée**
   - Utiliser un utilisateur Slack sans entrée `slack_identities` ni mapping legacy.
   - Vérifier redirection: `/login?slack=auth_failed&reason=identity_not_linked`.

8. **Workspace interdit**
   - Utiliser un utilisateur d'un autre workspace quand `SLACK_TEAM_ID` est configuré.
   - Vérifier redirection: `/login?slack=auth_failed&reason=workspace_not_allowed`.

9. **Email profile manquant**
   - Supprimer l'email du profil Timeline lié.
   - Vérifier redirection: `/login?slack=auth_failed&reason=missing_profile_email`.

10. **Magic link en échec**
    - Simuler une erreur `generateLink`.
    - Vérifier redirection: `/login?slack=auth_failed&reason=magic_link_failed`.

11. **Liaison Slack existante**
    - Lancer le flow `/api/slack/connect/start` puis callback de connexion Slack.
    - Vérifier que ce flow fonctionne toujours et qu'il s'appuie sur `oauth.v2.access`.
