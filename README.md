# Mission Planner - Phase 5

Application Next.js (App Router) pour gérer des missions proposées à des bénévoles, avec sélection finale d'équipe et filtres métier.

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

### Nouveautés SQL phase 5

- `20260417210000_phase5_skills_and_filters.sql`
  - table `skills` (référentiel des compétences)
  - table `profile_skills` (liaison profils ↔ compétences)
  - table `mission_required_skills` (liaison missions ↔ compétences requises)
  - contraintes d'unicité:
    - `skills.name`
    - `(profile_id, skill_id)`
    - `(mission_id, skill_id)`
  - index sur les colonnes de liaison
  - fonction helper `can_read_mission` pour sécuriser l'accès lecture des compétences requises
  - policies RLS strictes pour `skills`, `profile_skills`, `mission_required_skills`

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

- compétences réalistes : `secourisme`, `logistique`, `conduite`, `radio`,
- affectation de compétences à plusieurs bénévoles,
- missions dans des secteurs différents (`Nord`, `Sud`) et à des dates différentes,
- missions avec compétences requises,
- propositions + une affectation sélectionnée pour tester le workflow complet.

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

## Fonctionnalités phase 5

### Filtres missions

Sur `/missions` :

- filtre par secteur (`Tous les secteurs` ou secteur précis),
- filtre par date de début min/max,
- filtre par compétence requise,
- affichage des compétences requises par mission.

### Filtres suivi responsable

Sur `/admin/proposals` :

- filtre secteur,
- filtre date de début min/max.

### Filtre compétences sur détail mission

Sur `/missions/[id]` (responsable/admin) :

- affichage des compétences requises de la mission,
- affichage des compétences de chaque bénévole,
- filtre de la liste des répondants (`available` / `maybe`) par compétence.

## RLS (résumé phase 5)

- `skills` : lecture authentifiée, écriture admin uniquement.
- `profile_skills` :
  - bénévole : lecture de ses propres compétences,
  - responsable : lecture des compétences des bénévoles,
  - admin : lecture globale,
  - écriture admin uniquement.
- `mission_required_skills` :
  - lecture selon accès mission,
  - écriture réservée à l'admin ou au gestionnaire de la mission.

## Test rapide phase 5

1. Se connecter en `responsable@pcivile.test`.
2. Aller sur `/missions`.
3. Tester les filtres secteur/date/compétence requise.
4. Ouvrir la mission “Poste de secours - Marathon de Lille”.
5. Dans **Équipe finale**, filtrer les bénévoles par compétence (ex: `secourisme`, `radio`).
6. Vérifier que les compétences des bénévoles sont visibles dans la liste.
7. Aller sur `/admin/proposals` et tester les filtres secteur/date.

## Limites connues phase 5

- Pas d'interface d'administration complète pour créer/éditer les compétences (seed + SQL pour MVP).
- Le filtrage est appliqué côté UI sur les données chargées (pas de recherche full-text ou pagination avancée).
- Pas de niveau de compétence (volontairement hors périmètre MVP).
