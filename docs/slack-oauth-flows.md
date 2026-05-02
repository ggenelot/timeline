# Intégration Slack — séparation stricte des flux OAuth

## Règle impérative
Slack impose **deux flux OAuth séparés** :

- **Installation bot/workspace** (`/oauth/v2/authorize`) avec des scopes bot/user OAuth classiques.
- **Login utilisateur** (`/openid/connect/authorize`) avec scopes OpenID seulement.

Ne jamais mélanger les scopes `openid`, `profile`, `email` avec des scopes de type `users:read`, `channels:*`, `groups:*`, `chat:*`, `im:*` dans une même URL d'autorisation.

## Flux d'installation bot
- Endpoint authorize: `https://slack.com/oauth/v2/authorize`
- Callback: `/api/slack/connect/callback`
- Token endpoint: `https://slack.com/api/oauth.v2.access`
- Scopes: scopes bot classiques uniquement.

## Flux login Slack
- Endpoint authorize: `https://slack.com/openid/connect/authorize`
- Callback: `/api/auth/slack/callback`
- Token endpoint: `https://slack.com/api/openid.connect.token`
- Scopes: `openid profile` uniquement.

Les scopes OpenID (`openid/profile`) **ne doivent pas** être ajoutés aux scopes d'installation classiques, sinon Slack peut retourner `invalid_permissions`.
Ils doivent être demandés uniquement lorsque l'utilisateur clique sur **« Se connecter avec Slack »**.

## Résolution d'identité
Le callback de login récupère `slack_user_id` et `slack_team_id` via `id_token` et/ou `openid.connect.userInfo`, puis fait le matching sur `slack_identities`.
