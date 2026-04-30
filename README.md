# Timeline - MVP Phase 6

Application web (Next.js + Supabase) pour gérer des missions de protection civile proposées à des bénévoles : proposition, réponse, sélection finale et suivi des missions retenues.

## Stack

- Next.js 14 (App Router)
- TypeScript
- Supabase (PostgreSQL + Auth + RLS)
- Tailwind CSS

## Fonctionnalités disponibles (fin phase 6)

- Authentification et profils (`admin`, `responsable`, `benevole`).
- Consultation des missions avec filtres (secteur, dates, compétences requises).
- Réponses bénévoles sur mission proposée (`available`, `unavailable`, `maybe`).
- Validation responsable/admin des propositions (`accepted`, `refused`).
- Sélection/retrait des bénévoles pour l'équipe finale.
- Vue bénévole des missions retenues.
- Historique métier minimal sur mission (création, changement de statut, réponses, sélection/retrait équipe).
- États vides et messages UX basiques (succès, erreur, chargement, actions désactivées).
- Garde-fous métier et RLS renforcés (missions annulées/confirmées verrouillées selon cas).

## Installation locale

### Prérequis

- Node.js 20+
- npm 10+
- Docker
- Supabase CLI

### Installer les dépendances

```bash
npm install
```

### Configuration front (`.env.local`)

Créer `.env.local` :

```bash
cp .env.example .env.local
```

Puis renseigner :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Configuration Supabase locale

### 1) Démarrer Supabase local

```bash
npm run supabase:start
```

### 2) Appliquer les migrations SQL

Ordre d'exécution (automatique via timestamp) :

1. `20260417090000_phase1_base.sql`
2. `20260417091000_phase2_mission_proposals.sql`
3. `20260417170000_fix_rls_policy_recursion.sql`
4. `20260417183000_phase3_mission_workflow.sql`
5. `20260417193000_phase4_mission_assignments.sql`
6. `20260417210000_phase5_skills_and_filters.sql`
7. `20260417223000_phase6_activity_logs_and_guards.sql`

Commande :

```bash
npm run supabase:db:push
```

### 3) Créer les comptes de test (Auth)

Créer dans Supabase Auth (mot de passe conseillé `DemoPass123!`) :

- `admin@pcivile.test`
- `responsable@pcivile.test`
- `benevole@pcivile.test`
- `benevole2@pcivile.test`
- `benevole3@pcivile.test`

### 4) Charger les seeds

```bash
npm run supabase:db:seed
```

Le seed couvre :

- missions avec statuts variés (`proposed`, `closed`, `cancelled`, `confirmed`),
- propositions avec statuts/réponses différents,
- affectations existantes,
- compétences profils + compétences requises mission,
- événements d'historique minimaux.

## Lancement local

```bash
npm run dev
```

Application : http://localhost:3000

## Parcours de test recommandé

1. Se connecter en `responsable@pcivile.test`.
2. Ouvrir `/missions`, tester les filtres et les états vides.
3. Ouvrir une mission `proposed`, sélectionner/retirer un bénévole, confirmer la mission.
4. Vérifier la section **Historique** sur la mission.
5. Aller sur `/admin/proposals` et valider/refuser une proposition.
6. Se connecter en `benevole@pcivile.test`.
7. Répondre à une mission `proposed`, vérifier blocage sur missions `closed`/`confirmed`.
8. Ouvrir `/my-missions` et vérifier la liste des affectations.

## RLS (résumé MVP phase 6)

- Bénévole : accès strict à ses propositions/affectations et aux missions qui lui sont proposées.
- Responsable : gestion stricte des missions qu'il possède et des données liées.
- Admin : vision globale.
- Historique : lecture autorisée si l'utilisateur peut lire la mission associée (ou admin).
- Écriture historique côté client désactivée (logs via triggers SQL uniquement).

## Limites connues du MVP final

- Historique minimal (pas de diff fin, pas de versioning, pas de pagination avancée).
- Pas de notifications temps réel (email/push/SMS).
- Pas de calendrier avancé ni de planning de conflits.
- Pas d'interface back-office dédiée pour gérer finement les compétences.
- Certaines validations métier restent concentrées sur statuts globaux (MVP volontairement simple).

## Pistes réalistes pour une V2

- Timeline mission paginée + filtres d'activité.
- Notifications configurables (nouvelle proposition, changement de statut, sélection).
- Gestion plus riche des affectations (remplacement, confirmation bénévole explicite, historique détaillé).
- Édition mission côté responsable avec workflow guidé.
- Recherche serveur + pagination sur missions/propositions.
- Tableaux de bord opérationnels (charge par secteur, taux de réponse, couverture compétences).

## Intégration Slack (V1)

### Variables d'environnement serveur

- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL`
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_OAUTH_REDIRECT_URI` (ex: `http://localhost:3000/api/slack/connect/callback`)

### Scopes Slack requis

Bot scopes:
- `chat:write`
- `channels:manage`
- `groups:write`
- `groups:read`
- `im:write`

User scopes (OAuth connect V1):
- `users:read`

OpenID scopes (login V2):
- `openid`
- `profile`
- `email`

### Endpoints Slack ajoutés

- `POST /api/slack/connect/start` : initie le flux OAuth de liaison de compte.
- `GET /api/slack/connect/callback` : finalise la liaison et met à jour le profil Timeline.
- `DELETE /api/slack/connect` : délie le compte Slack du profil.
- `POST /api/slack/commands` : endpoint signé Slack (base pour future auth depuis Slack).

### Flux métier branchés

- Passage bénévole à `unavailable` via admin mission -> DM Slack idempotent (`volunteer_rejected_dm`).
- Confirmation mission via endpoint serveur -> création/sync canal privé + invitation des bénévoles retenus.
- Action manuelle en fiche mission: **Créer / resynchroniser le canal Slack**.


## Auth Slack (V2)

Nouveaux endpoints:
- `POST /api/auth/slack/start`
- `GET /api/auth/slack/callback`
- `GET /auth/slack/magic?token=...`

Variables supplémentaires:
- `SLACK_AUTH_REDIRECT_URI` (ex: `http://localhost:3000/api/auth/slack/callback`)

Slash command:
- `/timeline login` sur `POST /api/slack/commands` (réponse ephemeral avec lien one-time, TTL 10 min).

Sécurité:
- états OAuth one-time + expiration
- challenges magic one-time hashés + expiration
- signature Slack vérifiée sur `/api/slack/commands`

Rollout recommandé:
1. déployer DB + backend derrière feature flag UI login Slack
2. activer bouton `/login` en interne
3. monitorer erreurs `slack=state_invalid|auth_failed|magic_invalid`
4. ouvrir à tous utilisateurs
