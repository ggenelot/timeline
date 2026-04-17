# Mission Planner - Phase 1

Socle minimal fonctionnel pour une application de gestion de missions bénévoles (protection civile).

## Prérequis

- Node.js 20+
- npm 10+
- Un projet Supabase

## Installation

```bash
npm install
```

## Variables d'environnement

1. Copiez le fichier d'exemple :

```bash
cp .env.example .env.local
```

2. Renseignez dans `.env.local` :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Ces valeurs sont disponibles dans **Supabase > Project Settings > API**.

## Exécution du SQL (Supabase)

Dans l'ordre, exécuter dans le SQL Editor:

1. `supabase/01_schema.sql`
2. `supabase/02_rls.sql`
3. `supabase/03_seeds.sql`

## Création des utilisateurs de test

Avant d'exécuter les seeds, créer ces utilisateurs dans **Supabase Auth > Users**:

- `admin@pcivile.test`
- `responsable@pcivile.test`
- `benevole@pcivile.test`

Mot de passe recommandé pour les tests locaux : `DemoPass123!`

Le trigger SQL crée automatiquement une ligne de profil lors de la création de chaque utilisateur.

## Lancement local

```bash
npm run dev
```

Application disponible sur `http://localhost:3000`.

## Test rapide phase 1

1. Ouvrir `/login`
2. Se connecter avec `responsable@pcivile.test`
3. Vérifier la page `/missions`:
   - profil affiché (nom + rôle)
   - liste des missions de démonstration
4. Se déconnecter puis reconnecter avec `benevole@pcivile.test` pour valider l'accès en lecture.

## Limites connues (phase 1)

- Pas encore de proposition ciblée de mission par bénévole.
- Pas encore de réponse disponible / indisponible / à confirmer.
- Pas encore de vue responsable de suivi des réponses.
- Pas encore de sélection d'équipe finale.
