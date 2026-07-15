# Installation et exploitation — Timeline

Ce document couvre l'installation complète en développement local, les scripts disponibles, les tests, et le déploiement avancé (CI/CD staging/production, auto-hébergement Docker).

Pour un déploiement simple en production (une seule instance, Vercel + Supabase), voir la section [**Déployer en production**](../README.md#déployer-en-production-vercel--supabase) du README — c'est le chemin le plus rapide si vous n'avez pas besoin d'un pipeline staging/production séparé.

---

## Sommaire

1. [Prérequis](#prérequis)
2. [Installation depuis zéro (développement local)](#installation-depuis-zéro-développement-local)
3. [Variables d'environnement](#variables-denvironnement)
4. [Base de données locale](#base-de-données-locale)
5. [Comptes de test](#comptes-de-test)
6. [Lancer l'application](#lancer-lapplication)
7. [Parcours de test](#parcours-de-test)
8. [Scripts disponibles](#scripts-disponibles)
9. [Tests](#tests)
10. [Déploiement avancé](#déploiement-avancé)

---

## Prérequis

| Outil | Version minimale | Vérification |
|---|---|---|
| [Node.js](https://nodejs.org) | 20+ | `node -v` |
| [npm](https://npmjs.com) | 10+ | `npm -v` |
| [Docker](https://docs.docker.com/get-docker/) | récent | `docker -v` |
| [Supabase CLI](https://supabase.com/docs/guides/cli) | récent | `supabase -v` |
| [Git](https://git-scm.com) | récent | `git -v` |

Installer Supabase CLI via npm si nécessaire :

```bash
npm install -g supabase
```

---

## Installation depuis zéro (développement local)

### 1. Cloner le dépôt

```bash
git clone https://github.com/ggenelot/timeline.git
cd timeline
```

### 2. Installer les dépendances Node

```bash
npm install
```

### 3. Créer le fichier d'environnement local

```bash
cp .env.example .env.local
```

Ouvrir `.env.local` et renseigner les variables (voir [Variables d'environnement](#variables-denvironnement) ci-dessous).

### 4. Démarrer Supabase en local

Docker doit être lancé. Supabase démarre une instance PostgreSQL locale, le studio d'administration, et les services Auth.

```bash
npm run supabase:start
```

À la fin de la commande, les URLs et clés locales sont affichées dans le terminal. Copier :

- `API URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role key` → `SUPABASE_SERVICE_ROLE_KEY`

Et les coller dans `.env.local`.

### 5. Appliquer les migrations de base de données

```bash
npm run supabase:db:push
```

Cette commande applique toutes les migrations du dossier `supabase/migrations/` dans l'ordre chronologique.

### 6. Créer les comptes de test

```bash
npm run demo:create-test-accounts
```

Crée (de façon idempotente) les 5 comptes `auth.users` fixes utilisés par les tests E2E et les captures d'écran de démo, mot de passe `DemoPass123!` (configurable via `E2E_TEST_PASSWORD`) :

| Email | Rôle applicatif |
|---|---|
| `admin@pcivile.test` | Admin |
| `responsable@pcivile.test` | Responsable |
| `benevole@pcivile.test` | Bénévole |
| `benevole2@pcivile.test` | Bénévole |
| `benevole3@pcivile.test` | Bénévole |

Relancer ce script est sans danger : les comptes déjà existants sont simplement réinitialisés sur ce mot de passe. Les rôles applicatifs sont ensuite assignés via les seeds (étape suivante).

### 7. Charger les données de seed

```bash
npm run supabase:db:seed
```

Le seed insère :

- Missions avec statuts variés (`proposed`, `closed`, `cancelled`, `confirmed`).
- Propositions avec statuts et réponses différents.
- Affectations d'équipe existantes.
- Compétences de profil et compétences requises par mission.
- Types de missions par défaut (Maraude, Garde, Formation, Vie d'antenne, Poste de secours).
- Événements d'historique initiaux.

### 7bis. Peupler la base avec des données de démo (optionnel)

Pour voir tout de suite le potentiel de l'application (beaucoup de bénévoles, de missions variées, de cursus en cours...), un script génère automatiquement un jeu de données riche, en plus des 5 comptes fixes ci-dessus :

```bash
npm run db:seed:demo
```

Ce script crée (idempotent — relancer ne duplique pas les données) :

- ~36 comptes (`auth.users` + profils) répartis admin / responsable / bénévole, avec emails `demo-*@timeline.demo` et le même mot de passe `DemoPass123!`.
- Des compétences et niveaux de progression variés par bénévole.
- ~25 missions couvrant tous les statuts, types et plages de dates (passées et futures).
- Des propositions et affectations d'équipe réalistes sur ces missions.
- Des inscriptions aux cursus CE/CP/CEPS avec doublures et compétences partiellement validées.

Par sécurité, le script refuse de s'exécuter si `NEXT_PUBLIC_SUPABASE_URL` ne ressemble pas à une instance locale (`127.0.0.1`/`localhost`). Pour forcer l'exécution sur un autre projet (déconseillé sur un projet de production), ajouter `--force` :

```bash
npm run db:seed:demo -- --force
```

Pour repartir d'une base propre : `npm run supabase:db:reset` puis relancer le script.

> Astuce : `npm run demo:setup` enchaîne `supabase:db:reset`, `demo:create-test-accounts`, `supabase:db:seed` et `db:seed:demo` en une seule commande.

### 7ter. Régénérer les captures d'écran de démo (optionnel)

Une fois l'application lancée (étape suivante) et les comptes de test créés, les captures d'écran utilisées dans le [README](../README.md) peuvent être régénérées automatiquement :

```bash
npm run demo:screenshots
```

Le script se connecte avec chaque rôle (`admin`, `responsable`, `bénévole`) et capture les vues illustrées dans le README, en écrasant les fichiers dans `docs/images/`. À relancer après un changement d'UI notable pour garder les captures à jour, sans étape manuelle.

### 8. Lancer le serveur de développement

```bash
npm run dev
```

L'application est accessible sur **http://localhost:3000**.

---

## Variables d'environnement

Le fichier `.env.example` contient toutes les variables avec leur description. Voici un récapitulatif par catégorie.

### Variables obligatoires

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL publique du projet Supabase (ex. `https://xyz.supabase.co` ou `http://127.0.0.1:54321` en local) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique Supabase (safe à exposer côté client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé de service Supabase (accès admin complet — **ne jamais exposer côté client**) |
| `APP_BASE_URL` | URL de base de l'application (ex. `http://localhost:3000` ou `https://monapp.vercel.app`) |

### Variables Slack (optionnelles)

L'application fonctionne sans Slack. Ces variables sont requises uniquement si l'intégration Slack est activée.

| Variable | Description |
|---|---|
| `SLACK_BOT_TOKEN` | Token du bot Slack (`xoxb-...`), pour les opérations missions (canal privé, invitations, DMs) |
| `SLACK_SIGNING_SECRET` | Secret de signature Slack, pour vérifier les slash commands |
| `SLACK_CLIENT_ID` | ID client OAuth Slack |
| `SLACK_CLIENT_SECRET` | Secret client OAuth Slack |
| `SLACK_OAUTH_REDIRECT_URI` | URI de callback pour la liaison de compte (ex. `http://localhost:3000/api/slack/connect/callback`) |
| `SLACK_AUTH_REDIRECT_URI` | URI de callback pour la connexion SSO (ex. `http://localhost:3000/api/auth/slack/callback`) |
| `SLACK_TEAM_ID` | ID du workspace Slack (optionnel, restreint la connexion à un seul workspace) |
| `SLACK_TEAM_DOMAIN` | Domaine du workspace Slack (optionnel, utilisé pour les redirections) |

### Variables eOPE (optionnelles)

L'application fonctionne sans eOPE. La synchronisation avec l'outil départemental (import d'événements, export des équipages) se configure normalement **depuis l'UI** (`/admin/integrations`) — voir [`docs/eope-api.md`](./eope-api.md). Les variables ci-dessous sont un repli facultatif (la valeur saisie dans l'UI prime, champ par champ) ; seule `CRON_SECRET` doit rester en environnement.

| Variable | Description |
|---|---|
| `EOPE_BASE_URL` | (Repli) URL du serveur eOPE (ex. `https://eope-preprod.kube.gmcrd.fr`) |
| `EOPE_CLIENT_ID` | (Repli) ID de l'application OAuth M2M créée dans eOPE (propriétaire = antenne) |
| `EOPE_CLIENT_SECRET` | (Repli) Secret de l'application (affiché une seule fois à la création) |
| `EOPE_SYNC_WINDOW_DAYS` | (Repli) Fenêtre d'import des événements en jours à venir (défaut : 90) |
| `CRON_SECRET` | Secret protégeant la route de cron `/api/cron/eope-sync` (absent = cron désactivé) |

### Variables de test (optionnelles)

| Variable | Description |
|---|---|
| `E2E_BASE_URL` | URL de base pour les tests E2E (par défaut : `APP_BASE_URL` ou `http://localhost:3000`) |
| `E2E_TEST_PASSWORD` | Mot de passe des comptes de test E2E (par défaut : `DemoPass123!`) |
| `SLACK_TEST_EMAIL` | Email du compte Slack utilisé dans les tests SSO |
| `SLACK_TEST_PASSWORD` | Mot de passe du compte Slack de test |
| `SLACK_TEST_WORKSPACE_URL` | URL du workspace Slack de test |
| `GOOGLE_MISSIONS_SHEET_PUBLIC_URL` | URL publique d'un Google Sheet pour l'import de missions |

---

## Base de données locale

### Commandes utiles

```bash
# Démarrer l'instance Supabase locale (Docker requis)
npm run supabase:start

# Arrêter l'instance
npm run supabase:stop

# Remettre la base à zéro (supprime toutes les données)
npm run supabase:db:reset

# Appliquer les migrations (sans reset)
npm run supabase:db:push

# Charger les seeds
npm run supabase:db:seed

# Créer un nouveau fichier de migration (préfixé automatiquement avec un timestamp)
npm run supabase:migration:new nom_de_la_migration
```

### Studio local

L'interface graphique Supabase est disponible sur **http://localhost:54323** pendant que l'instance locale tourne.

### Structure des migrations

Voir [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md#modèle-de-données-principal) pour le détail des phases de migration et le modèle de données.

> **Règle critique** : Ne jamais modifier manuellement les fichiers de migration existants ni éditer directement la table `schema_migrations` en base. Voir `AGENTS.md` pour les règles complètes.

---

## Comptes de test

| Email | Mot de passe | Rôle | Ce qu'il peut faire |
|---|---|---|---|
| `admin@pcivile.test` | `DemoPass123!` | Admin | Tout voir et tout faire |
| `responsable@pcivile.test` | `DemoPass123!` | Responsable | Gérer ses missions, valider les propositions |
| `benevole@pcivile.test` | `DemoPass123!` | Bénévole | Répondre aux missions proposées, voir ses missions retenues |
| `benevole2@pcivile.test` | `DemoPass123!` | Bénévole | Idem |
| `benevole3@pcivile.test` | `DemoPass123!` | Bénévole | Idem |

Ce sont les comptes stables utilisés par les tests E2E, provisionnés via `npm run demo:create-test-accounts` (voir [étape 6](#installation-depuis-zéro-développement-local)). Si le script de démo (voir [étape 7bis](#installation-depuis-zéro-développement-local)) a été exécuté, de nombreux autres comptes `demo-*@timeline.demo` existent également — pour les parcourir, utiliser Supabase Studio (Authentication → Users) ou la page `/admin/volunteers` de l'application.

---

## Lancer l'application

```bash
# Développement (hot reload)
npm run dev

# Build de production
npm run build

# Lancer la version buildée
npm start
```

---

## Parcours de test

### En tant que responsable

1. Se connecter avec `responsable@pcivile.test`.
2. Ouvrir `/missions`, tester les filtres (catégorie, dates, compétences).
3. Ouvrir une mission au statut `proposed`.
4. Sélectionner / retirer un bénévole de l'équipe.
5. Confirmer la mission.
6. Vérifier la section **Historique** sur la fiche mission.
7. Aller sur `/admin/proposals` et valider ou refuser une proposition.

### En tant que bénévole

1. Se connecter avec `benevole@pcivile.test`.
2. Répondre `disponible` sur une mission `proposed`.
3. Vérifier que les missions `closed` ou `confirmed` bloquent les modifications.
4. Ouvrir `/my-missions` et vérifier la liste des affectations retenues.

### En tant qu'admin

1. Se connecter avec `admin@pcivile.test`.
2. Accéder à `/admin/volunteers` pour voir tous les bénévoles.
3. Vérifier `/admin/gestion` pour la gestion globale des missions.
4. Vérifier l'accès aux compétences sur `/admin/competences`.
5. Si Slack configuré : tester le healthcheck sur `/api/admin/slack/health`.

---

## Scripts disponibles

```bash
# Application
npm run dev              # Serveur de développement (http://localhost:3000)
npm run build            # Build de production
npm start                # Serveur de production

# Qualité de code
npm run lint             # ESLint
npm run typecheck        # Vérification TypeScript

# Tests
npm test                 # typecheck + tests E2E P0
npm run test:e2e         # Tous les tests E2E (Playwright)
npm run test:e2e:p0      # Tests de régression P0 uniquement
npm run test:e2e:slack-sso  # Tests Slack SSO

# Supabase
npm run supabase:start          # Démarrer l'instance locale
npm run supabase:stop           # Arrêter l'instance locale
npm run supabase:db:reset       # Remettre la base à zéro
npm run supabase:db:push        # Appliquer les migrations
npm run supabase:db:seed        # Charger les seeds
npm run supabase:migration:new  # Créer une migration
npm run db:seed:demo            # Peupler la base avec des données de démo riches (comptes, missions, cursus)

# Démo / captures d'écran
npm run demo:create-test-accounts  # Créer les 5 comptes de test fixes (idempotent)
npm run demo:setup                 # Reset complet + comptes de test + seeds + données de démo, en une commande
npm run demo:screenshots            # Régénérer les captures d'écran du README (app démarrée requise)

# Utilitaires
npm run diagnose:slack-oauth    # Diagnostiquer la configuration OAuth Slack
```

---

## Tests

### Tests E2E (Playwright)

Les tests tournent sur une instance locale de l'application. Supabase local doit être démarré.

```bash
# Tous les tests
npm run test:e2e

# Tests de régression P0 uniquement
npm run test:e2e:p0

# Tests Slack SSO
npm run test:e2e:slack-sso
```

Les artéfacts en cas d'échec (traces, screenshots, vidéos) sont sauvegardés dans `test-results/`.

### Vérification de type

```bash
npm run typecheck
```

### Audit sécurité (historique Git)

Avant d'ouvrir le dépôt publiquement, scanner l'historique Git pour détecter d'éventuels secrets committés :

```bash
./scripts/scan-secrets-history.sh
```

Le script retourne un code non-zéro en cas de correspondance à investiguer.

---

## Déploiement avancé

Pour un déploiement simple à instance unique, voir [**Déployer en production**](../README.md#déployer-en-production-vercel--supabase) dans le README. Cette section couvre les cas plus avancés : pipeline staging/production séparé, et auto-hébergement.

### Pipeline staging/production (CI/CD)

Le projet Timeline lui-même utilise deux environnements : **staging** (intégration, branche `staging`) et **production** (branche `main`), chacun avec son propre projet Supabase. Ce découpage est utile si plusieurs personnes contribuent au code et qu'on veut valider les migrations avant de les appliquer en production.

- Configuration Vercel : variables d'environnement séparées par environnement (Production → Supabase prod, Preview → Supabase staging).
- Push sur `staging` → CI verte → `.github/workflows/supabase-staging.yml` applique les migrations sur le projet Supabase staging.
- Push sur `main` → CI verte → `.github/workflows/supabase-prod.yml` applique les migrations sur le projet Supabase production.

Secrets GitHub requis pour la CI/CD :

| Secret | Description |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Token d'accès Supabase CLI (compte, partagé entre les deux projets) |
| `SUPABASE_DB_PASSWORD` | Mot de passe de la base de données de production |
| `SUPABASE_PROJECT_ID` | ID du projet Supabase de production |
| `STAGING_SUPABASE_DB_PASSWORD` | Mot de passe de la base de données staging |
| `STAGING_SUPABASE_PROJECT_ID` | ID du projet Supabase staging |

Voir [`CONTRIBUTING.md`](../CONTRIBUTING.md) pour la mise en place complète de ce pipeline (configuration GitHub, projet Supabase staging) et `AGENTS.md` § 7 pour le détail des workflows.

### Serveur auto-hébergé (Docker)

Pour héberger l'application sur son propre serveur (VPS, etc.) plutôt que sur Vercel, l'app Next.js peut être conteneurisée avec le `Dockerfile` et le `docker-compose.yml` fournis à la racine. La base de données reste **Supabase Cloud** (le même projet que pour Vercel/local) — il n'y a pas de conteneur Postgres, uniquement le frontend/les API routes.

**Prérequis** : Docker + Docker Compose installés sur le serveur, et un projet Supabase Cloud déjà créé (voir [Déployer en production](../README.md#déployer-en-production-vercel--supabase) dans le README).

```bash
# Créer le fichier d'environnement (mêmes variables que .env.local, voir .env.example)
cp .env.example .env

# Builder l'image (les NEXT_PUBLIC_* sont passés en build args automatiquement)
docker compose build

# Démarrer le conteneur
docker compose up -d
```

L'application écoute sur `http://localhost:3000` (ou l'IP du serveur). Ce conteneur ne sert que du HTTP brut : pour exposer le site en HTTPS, le placer derrière un reverse proxy comme Caddy ou Nginx, par exemple avec Caddy :

```
votre-domaine.fr {
  reverse_proxy localhost:3000
}
```

**Mise à jour** : comme les variables `NEXT_PUBLIC_*` sont injectées au moment du build, un rebuild est nécessaire à chaque déploiement :

```bash
git pull && docker compose build && docker compose up -d
```

Les migrations de base de données restent indépendantes de Docker : elles s'appliquent toujours via `npx supabase db push` ou le workflow GitHub Actions `supabase-prod.yml` décrit ci-dessus.

### Checklist post-déploiement

- [ ] Connexion utilisateur fonctionnelle.
- [ ] Liste des missions et filtres OK.
- [ ] Réponse bénévole (disponible / indisponible / peut-être) OK.
- [ ] Validation admin des propositions OK.
- [ ] Mission confirmée visible dans `/my-missions`.
- [ ] Si Slack actif : healthcheck `/api/admin/slack/health` retourne `ok`.
