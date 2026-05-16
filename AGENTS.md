# AGENTS.md — Instructions pour agents IA

Ce fichier définit les règles et contraintes à respecter lorsqu'un agent IA (Claude Code, Codex, Copilot, etc.) travaille sur ce dépôt.

---

## 1. Migrations Supabase — Règles critiques

Les migrations sont le seul chemin d'évolution du schéma. Toute violation peut corrompre l'environnement de production.

### Ce qu'il faut toujours faire

- **Inspecter** `supabase/migrations/` avant de créer une nouvelle migration pour connaître le dernier timestamp utilisé.
- **Utiliser** `npm run supabase:migration:new <nom>` pour créer un fichier de migration — le CLI génère automatiquement un timestamp valide.
- **Vérifier** l'absence de collision de timestamp après toute création de migration :
  ```bash
  ls supabase/migrations/ | sort | tail -5
  ```
- **Réconcilier immédiatement** le dépôt après toute modification manuelle de schéma (workflow officiel Supabase : `supabase db pull` + `supabase migration repair`).

### Ce qu'il ne faut jamais faire

- Ne **jamais réutiliser** un timestamp de migration existant pour un nouveau fichier.
- Ne **jamais modifier** un fichier de migration déjà appliqué en production.
- Ne **jamais éditer directement** la table `supabase_migrations.schema_migrations` à la main.
- Ne **jamais proposer** de workarounds qui contournent le système de migrations (ex. `ALTER TABLE` direct en SQL sans migration).
- Ne **jamais supprimer** une migration du dossier sans avoir d'abord vérifié qu'elle n'a pas été appliquée en production.

### Format des noms de migration

```
YYYYMMDDHHMMSS_description_courte.sql
```

Exemple : `20260601120000_add_index_on_missions_status.sql`

---

## 2. Sécurité

### Secrets

- Ne **jamais** commiter de secrets (tokens, mots de passe, clés API) dans un fichier versionné, même dans un commentaire ou une chaîne de test.
- Toujours utiliser des variables d'environnement (`.env.local` pour le local, secrets de la plateforme pour la production).
- Si un secret est accidentellement commité, le révoquer immédiatement et utiliser `./scripts/scan-secrets-history.sh` pour auditer l'historique.

### RLS (Row-Level Security)

- Toute nouvelle table doit avoir des politiques RLS définies dans la même migration.
- Ne jamais désactiver RLS sur une table contenant des données utilisateur.
- Tester les politiques avec les trois rôles (`admin`, `responsable`, `benevole`) avant de déployer.

### Variables d'environnement côté client

- Les variables `NEXT_PUBLIC_*` sont exposées dans le navigateur. N'y mettre que des valeurs publiques.
- `SUPABASE_SERVICE_ROLE_KEY` ne doit **jamais** apparaître dans du code côté client.

---

## 3. Stack et conventions de code

### Langage et framework

- **TypeScript strict** : tout le code doit passer `npm run typecheck` sans erreur.
- **Next.js App Router** : utiliser les Server Components par défaut, passer en Client Component (`"use client"`) uniquement si nécessaire (interactivité, hooks).
- **Tailwind CSS** : styler avec des classes utilitaires Tailwind. Pas de CSS modules ni de styled-components.

### Supabase

- Utiliser `lib/supabase/server.ts` pour les accès serveur (Server Components, API routes).
- Utiliser `lib/supabase/client.ts` pour les accès côté client.
- Ne jamais utiliser `SUPABASE_SERVICE_ROLE_KEY` dans du code client.

### API Routes

- Placer les endpoints dans `app/api/`.
- Valider les données d'entrée à la frontière (entrées utilisateur, webhooks Slack).
- Vérifier l'authentification sur chaque route sensible via les helpers de `lib/api/auth.ts`.

### Tests

- Les tests E2E se trouvent dans `tests/e2e/`.
- Exécuter `npm test` (typecheck + P0) avant toute PR.
- Ne pas introduire de dépendances à des comptes ou workspaces Slack dans les tests P0.

---

## 4. Intégration Slack

- Les variables Slack sont toutes optionnelles. Le code qui les utilise doit être défensif (vérifier leur présence avant usage).
- La signature Slack doit être vérifiée sur tous les endpoints exposés à Slack (via `lib/slack/signature.ts`).
- Les états OAuth sont à usage unique — ne jamais réutiliser un state consommé.

---

## 5. CI/CD et branches

### Branches

- Développement sur la branche courante (`claude/update-docs-config-PJeiP` pour cette session).
- Les migrations de production sont déployées automatiquement lors du merge sur `main` via le workflow `.github/workflows/supabase-prod.yml`.

### Avant chaque PR

1. `npm run typecheck` — pas d'erreur TypeScript.
2. `npm run lint` — pas d'erreur ESLint.
3. `npm test` — tests P0 verts.
4. Pas de collision de timestamp de migration.
5. Pas de secret dans les fichiers modifiés.

---

## 6. Documentation

- Maintenir `README.md` à jour lors de tout changement de variable d'environnement, de commande, ou de fonctionnalité majeure.
- Mettre à jour `.env.example` en parallèle de tout ajout de variable d'environnement.
- Les guides utilisateur sont dans `docs/`.
