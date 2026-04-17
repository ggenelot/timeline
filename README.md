# Mission Planner - Phase 4

Application Next.js (App Router) pour gérer des missions proposées à des bénévoles, avec sélection finale d'équipe.

## Prérequis

- Node.js 20+
- npm 10+
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- Docker (pour Supabase local)

## Installation

```bash
npm install
cp .env.example .env.local
```

Renseignez ensuite dans `.env.local` :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Base de données (migrations SQL)

Les migrations sont sous `supabase/migrations/`.

### Nouveautés SQL phase 4

- `20260417193000_phase4_mission_assignments.sql`
  - type `mission_assignment_status`
  - table `mission_assignments`
  - index + unicité `(mission_id, volunteer_id)`
  - fonctions helper RLS :
    - `can_manage_mission`
    - `mission_status_is`
    - `can_select_volunteer_for_mission`
  - policies RLS strictes pour affectations
  - ajustements RLS sur `mission_proposals` pour bloquer les réponses si mission non `proposed`

### Appliquer les migrations

```bash
npm run supabase:db:push
```

### Charger les seeds

```bash
npm run supabase:db:seed
```

## Données de test (seed)

Le seed inclut désormais :

- une mission `proposed` avec plusieurs propositions,
- un bénévole en `available`,
- un bénévole en `maybe`,
- une affectation déjà `selected` dans `mission_assignments`.

Utilisateurs de test à créer dans Supabase Auth :

- `admin@pcivile.test`
- `responsable@pcivile.test`
- `benevole@pcivile.test`
- `benevole2@pcivile.test`
- `benevole3@pcivile.test`

Mot de passe suggéré : `DemoPass123!`

## Lancement local

```bash
npm run dev
```

## Fonctionnalités phase 4

- Sélection finale dans le détail mission (`/missions/[id]`) :
  - liste des réponses bénévoles,
  - bouton **Retenir / Retirer** pour l'équipe finale,
  - sélection autorisée uniquement pour réponses `available` ou `maybe`,
  - confirmation mission via bouton **Confirmer la mission** (statut `confirmed`).
- Blocages métier minimaux :
  - mission `cancelled` : plus de sélection,
  - mission `closed`/`confirmed`/`cancelled` : plus de nouvelles réponses bénévoles.
- Vue bénévole dédiée : `/my-missions`
  - affiche uniquement les missions où le bénévole connecté est affecté.

## Test rapide phase 4

1. Se connecter en `responsable@pcivile.test`.
2. Aller sur `/missions`, ouvrir la mission “Poste de secours - Marathon de Lille”.
3. Dans **Équipe finale**, cliquer sur **Retenir** pour un bénévole `available` ou `maybe`.
4. Cliquer sur **Confirmer la mission**.
5. Se connecter en `benevole@pcivile.test`.
6. Aller sur `/my-missions`.
7. Vérifier les informations : titre, date/heure, lieu, secteur, statut mission, statut affectation.

## RLS (résumé)

- Bénévole :
  - voit uniquement ses propres affectations,
  - ne peut pas écrire dans `mission_assignments`.
- Responsable :
  - gère les affectations uniquement des missions qu'il a créées.
- Admin :
  - accès global.
- Affectation impossible si la réponse bénévole n'est pas `available` ou `maybe`.
- Confirmation mission réservée au créateur de mission (ou admin via policy update mission).
