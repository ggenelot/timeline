# AGENTS.md — Instructions pour agents IA

Ce fichier définit les règles et contraintes à respecter lorsqu'un agent IA (Claude Code, Codex, Copilot, etc.) travaille sur ce dépôt.

---

## 1. Vue d'ensemble du projet

**Timeline** est une application web Next.js 14 + Supabase pour gérer les missions de bénévoles en protection civile. Les admins créent des missions, les bénévoles signalent leurs disponibilités, et les responsables constituent les équipages. Toute l'interface est en **français**.

### Stack

| Couche | Technologie |
|---|---|
| Framework | Next.js 14 App Router, TypeScript strict |
| Base de données | Supabase (PostgreSQL + Auth + Realtime) |
| UI | Tailwind CSS + shadcn/ui |
| Auth | Supabase Auth (email/mot de passe) + Slack SSO |
| Notifications | Slack bot (webhook + OAuth) |
| Tests | Playwright (E2E uniquement) |

### Structure des dossiers

```
/app                – Pages et API routes (App Router)
  /api              – Routes API (serveur uniquement)
  /missions         – Liste et détail des missions
  /my-missions      – Tableau de bord bénévole
  /admin            – Pages admin
/components
  /missions         – Composants mission
  /skills           – Gestion des compétences
  /ui               – Wrappers shadcn/ui génériques
/lib
  /supabase         – client.ts (browser), server.ts (server), admin.ts (service role)
  slack.ts          – Helpers Slack
/supabase
  /migrations       – Fichiers SQL de migration (horodatés)
  /seeds            – Données de test locales
  /functions        – Supabase Edge Functions
/tests/e2e          – Tests Playwright
```

---

## 2. Migrations Supabase — Règles critiques

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

## 3. Sécurité

### Secrets

- Ne **jamais** commiter de secrets (tokens, mots de passe, clés API) dans un fichier versionné, même dans un commentaire ou une chaîne de test.
- Toujours utiliser des variables d'environnement (`.env.local` pour le local, secrets de la plateforme pour la production).
- Si un secret est accidentellement commité, le révoquer immédiatement.

### RLS (Row-Level Security)

- Toute nouvelle table doit avoir des politiques RLS définies dans la même migration.
- Ne jamais désactiver RLS sur une table contenant des données utilisateur.
- Tester les politiques avec les trois rôles (`admin`, `responsable`, `benevole`) avant de déployer.

### Variables d'environnement côté client

- Les variables `NEXT_PUBLIC_*` sont exposées dans le navigateur. N'y mettre que des valeurs publiques.
- `SUPABASE_SERVICE_ROLE_KEY` ne doit **jamais** apparaître dans du code côté client.

---

## 4. Stack et conventions de code

### TypeScript

- **Mode strict activé** — ne jamais utiliser `as any` sans commentaire expliquant pourquoi.
- Préférer les types de retour explicites sur les fonctions exportées.
- Utiliser l'alias `@/` pour tous les imports internes.

### React / Next.js

- Utiliser les **Server Components** par défaut pour le data fetching ; passer en `"use client"` uniquement si l'interactivité l'exige (état, effets, APIs navigateur).
- Ne jamais appeler des API routes depuis les Server Components — interroger Supabase directement via le client serveur.
- Garder les composants de page légers ; extraire la logique dans des composants ou des server actions.

### Clients Supabase

| Contexte | Import |
|---|---|
| Server Component / Route Handler | `createClient` depuis `@/lib/supabase/server` |
| Client Component | `createClient` depuis `@/lib/supabase/client` |
| Opérations serveur privilégiées | `createAdminClient` depuis `@/lib/supabase/admin` |

### API Routes

- Valider toutes les entrées à la frontière ; ne jamais faire confiance aux données client.
- Utiliser le client service-role uniquement dans les Route Handlers, jamais côté navigateur.
- Retourner des codes HTTP standards et des objets d'erreur JSON `{ error: string }`.

### Style de code

- Pas de commentaires sauf si le **pourquoi** est non-évident (contrainte cachée, invariant subtil, contournement d'un bug).
- Pas de docstrings ni de blocs de commentaires décrivant ce que fait le code.
- Pas d'implémentations à moitié terminées — si quelque chose est hors périmètre, laisser un TODO précis, ne pas shipper du code cassé.

---

## 5. Intégration Slack

- Les variables Slack sont toutes optionnelles. Le code qui les utilise doit être défensif (vérifier leur présence avant usage).
- La signature Slack doit être vérifiée sur tous les endpoints exposés à Slack (via `lib/slack/signature.ts`).
- Les états OAuth sont à usage unique — ne jamais réutiliser un state consommé.

---

## 6. Tests

### Lancer les tests

```bash
npm run typecheck          # TypeScript — doit être propre avant tout
npm run lint               # ESLint
npm run test               # typecheck + E2E P0
npm run test:e2e:p0        # Suite Playwright P0 uniquement
```

### Comptes de test E2E (local/staging uniquement)

| Rôle | Email |
|---|---|
| Admin | `admin@pcivile.test` |
| Responsable | `responsable@pcivile.test` |
| Bénévole | `benevole@pcivile.test` |

Mot de passe via la variable d'env `E2E_TEST_PASSWORD` (défaut : `protec1234`).

### Écrire des tests

- N'ajouter des tests E2E que pour les flux P0 (login, workflow mission principal).
- Les tests doivent être déterministes — pas de `sleep`, utiliser `waitForURL` / `waitForSelector` / `expect().toBeVisible()`.
- Utiliser `test.describe.serial` quand les tests partagent un état (ex. une mission modifiée au test 3 vérifiée au test 4).
- Ne pas introduire de dépendances à des comptes ou workspaces Slack dans les tests P0.

---

## 7. CI/CD et branches

### Environnements

Le projet a deux environnements depuis le passage en prod multi-contributeurs :

| Environnement | Branche | Déploiement Vercel | Base Supabase |
|---|---|---|---|
| **Staging** | `staging` | URL stable (déploiement de branche) | Projet Supabase staging |
| **Production** | `main` | Domaine de production | Projet Supabase production |

Chaque PR (quelle que soit sa branche source) génère en plus un **Preview Deployment** Vercel dédié, pointant vers la base staging.

### Workflows GitHub Actions

| Workflow | Déclencheur | Rôle |
|---|---|---|
| `ci.yml` | PR + push main/staging | Typecheck → Lint → Build |
| `supabase-staging.yml` | CI vert sur staging | Déploiement migrations sur le projet Supabase staging |
| `supabase-prod.yml` | CI vert sur main | Déploiement migrations en production |
| `supabase-migration-timestamp-guard.yml` | PR + push main/staging | Bloque les collisions de timestamp |
| `auto-merge.yml` | PR dont la base est `staging` | Auto-merge des branches agents vers staging |

Toute PR doit passer le workflow **CI** (typecheck → lint → build) avant de pouvoir être mergée.

### Conventions de branches

| Préfixe | Usage | Base de la PR |
|---|---|---|
| `feature/` | Nouvelles fonctionnalités | `staging` |
| `fix/` | Corrections de bugs | `staging` |
| `claude/` | Branches Claude Code (auto-merge éligible) | `staging` |
| `codex/` | Branches Codex (auto-merge éligible) | `staging` |

Les branches agents (`claude/`, `codex/`) sont auto-mergées en squash sur **`staging`** une fois tous les checks verts et sans label `do-not-merge`. L'auto-merge ne se déclenche pas si la PR cible `main`.

`main` ne reçoit que des PR de promotion `staging → main`, ouvertes et mergées manuellement par un humain après validation sur l'environnement staging. Aucun auto-merge ni push direct n'est autorisé sur `main`.

Ne **jamais** force-pusher sur `main` ni sur `staging`.

### Branches d'intégration ad-hoc (fonctionnalités multi-PR)

Quand une fonctionnalité demande plusieurs itérations ou plusieurs PR successives (ex. une série de changements liés sur une même feature, parfois étalés sur plusieurs sessions d'agent), créer une **branche d'intégration ad-hoc** dédiée plutôt que de cibler `staging` directement :

1. Créer la branche d'intégration depuis `staging` : `git checkout -b suivi-competences origin/staging` puis `git push -u origin suivi-competences`. Le nom doit décrire la fonctionnalité, pas l'agent qui l'a créée.
2. Toutes les PR de la fonctionnalité (y compris les branches `claude/`, `codex/`) ciblent cette branche d'intégration comme base — **pas** `staging`. L'auto-merge ne se déclenche que si la base est `staging`, donc ces PR sont mergées manuellement (ou par un agent) sur la branche d'intégration au fil de l'eau.
3. Une fois la fonctionnalité jugée complète et testée sur cette branche, ouvrir une PR `<branche d'intégration> → staging`. Cette PR suit les règles normales (CI verte, etc.) et peut être auto-mergée comme une PR `claude/`/`codex/` classique si elle en a le préfixe.
4. La promotion finale `staging → main` reste inchangée (revue humaine obligatoire, jamais d'auto-merge).

Si un agent reprend une fonctionnalité déjà en cours sur une branche d'intégration ad-hoc existante, il doit retargeter ses PR vers cette branche plutôt que vers `main` ou `staging`.

### Avant chaque PR

1. `npm run typecheck` — pas d'erreur TypeScript.
2. `npm run lint` — pas d'erreur ESLint.
3. `npm test` — tests P0 verts.
4. Pas de collision de timestamp de migration.
5. Pas de secret dans les fichiers modifiés.

### Avant une promotion `staging → main`

1. Vérifier que `staging` est vert (CI + migration staging appliquée sans erreur).
2. Tester manuellement le parcours impacté sur l'URL staging.
3. Ouvrir une PR `staging → main`, revue par un humain (pas d'auto-merge).
4. Une fois mergée, `supabase-prod.yml` rejoue automatiquement les mêmes migrations déjà validées sur staging.

### Déploiement d'urgence (bypass CI)

`supabase-staging.yml` et `supabase-prod.yml` exposent aussi un déclencheur manuel (`workflow_dispatch`) qui **bypasse la vérification CI verte** :

```bash
gh workflow run supabase-staging.yml
gh workflow run supabase-prod.yml
```

À n'utiliser qu'en cas d'urgence (ex. CI cassée par un problème d'infra sans rapport avec le code, hotfix critique) et seulement après avoir vérifié manuellement que le code à déployer est sain — ce mode ne revalide rien automatiquement.

---

## 8. Documentation

- Maintenir `README.md` à jour lors de tout changement de variable d'environnement, de commande, ou de fonctionnalité majeure.
- Mettre à jour `.env.example` en parallèle de tout ajout de variable d'environnement.
- Les guides utilisateur sont dans `docs/`.
