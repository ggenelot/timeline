# Slack Auth V1 — cas de test

## Objectif
Valider que le flow `/api/auth/slack/start -> /api/auth/slack/callback` n'authentifie que des utilisateurs Timeline déjà liés à Slack.

## Cas

1. **Identity directe trouvée**
   - Précondition: une ligne `slack_identities` existe avec `slack_team_id + slack_user_id` et `profile_id` valide.
   - Attendu: callback génère un magic link via `auth.admin.generateLink` pour `profiles.email` et redirige vers le lien.

2. **Fallback legacy profile autorisé**
   - Précondition: aucune ligne `slack_identities`; une ligne `profiles` existe avec `slack_team_id + slack_user_id` exacts.
   - Attendu: callback fait un `upsert` dans `slack_identities`, puis génère le magic link.

3. **Aucune identité liée**
   - Précondition: aucune ligne dans `slack_identities` et aucun match legacy dans `profiles`.
   - Attendu: redirection vers `/auth/slack/unlinked`.

4. **Pas de fallback email**
   - Précondition: email OpenID Slack correspond à un profil, mais `slack_team_id + slack_user_id` ne matchent nulle part.
   - Attendu: redirection `/auth/slack/unlinked` (aucun lien via email).

5. **Route magic legacy sans identité liée**
   - Précondition: token challenge valide mais pas d'identité Slack liée.
   - Attendu: `/auth/slack/magic` redirige `/auth/slack/unlinked` et ne crée pas d'utilisateur synthétique.

6. **Logs serveur non sensibles**
   - Vérifier que les logs contiennent les statuts de flow (incoming, invalid state, linked/unlinked, generate link)
   - Vérifier qu'aucun secret/token n'est loggé.
