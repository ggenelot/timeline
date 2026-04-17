# Mission Planner - Phase 2

Socle minimal fonctionnel pour une application de gestion de missions bénévoles (protection civile), avec proposition ciblée et réponse bénévole.

## Prérequis

- Node.js 20+
- npm 10+
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- Docker (requis par Supabase CLI pour la stack locale)

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

En local Supabase CLI, ces valeurs sont affichées par `supabase start`.

## Gestion de la base via migrations (Supabase CLI)

Le schéma est désormais versionné dans le repo sous `supabase/` :

- `supabase/migrations/*.sql` : migrations SQL versionnées (phase 1 + phase 2)
- `supabase/seed.sql` : données de test idempotentes
- `supabase/config.toml` : configuration locale Supabase CLI

### Démarrer Supabase en local

```bash
npm run supabase:start
```

### Appliquer les migrations

- Sur une base locale neuve, `supabase start` applique déjà les migrations.
- Pour appliquer explicitement les migrations en environnement lié :

```bash
npm run supabase:db:push
```

### Reset complet de la base (migrations + seed)

```bash
npm run supabase:db:reset
```

### Recharger les seeds seulement

```bash
npx supabase db seed
```

### Ajouter une future migration

```bash
npm run supabase:migration:new -- <nom_migration>
```

Puis compléter le fichier généré dans `supabase/migrations/`.

## Création des utilisateurs de test

Avant d'exécuter les seeds, créer ces utilisateurs dans **Supabase Auth > Users**:

- `admin@pcivile.test`
- `responsable@pcivile.test`
- `benevole@pcivile.test`
- `benevole2@pcivile.test` (optionnel, recommandé)
- `benevole3@pcivile.test` (optionnel)

Mot de passe recommandé pour les tests locaux : `DemoPass123!`

Le trigger SQL crée automatiquement une ligne de profil lors de la création de chaque utilisateur.

## Lancement local

```bash
npm run dev
```

Application disponible sur `http://localhost:3000`.

## Fonctionnalités Phase 2

- Table `mission_proposals` pour lier une mission à plusieurs bénévoles.
- Réponses bénévoles possibles: `no_response`, `available`, `unavailable`, `maybe`.
- Contrainte d'unicité `(mission_id, volunteer_id)` pour éviter les doublons de proposition.
- Page de détail mission: `/missions/[id]`.
- Responsable (créateur de mission) : propose une mission à plusieurs bénévoles.
- Bénévole : voit seulement les missions qui lui sont proposées et peut répondre.
- RLS stricte:
  - bénévole: accès limité à ses propositions/missions proposées,
  - responsable: accès à ses missions et propositions liées,
  - admin: accès global.

## Test rapide phase 2

1. Ouvrir `/login`.
2. Se connecter avec `responsable@pcivile.test`.
3. Aller sur `/missions` puis ouvrir une mission via **Voir le détail**.
4. Dans **Proposer cette mission à des bénévoles**, sélectionner 1+ bénévoles puis envoyer.
5. Se déconnecter et se connecter avec `benevole@pcivile.test`.
6. Vérifier que `/missions` n'affiche que les missions proposées à ce bénévole.
7. Ouvrir le détail mission et changer **Ma réponse** (disponible/indisponible/peut-être/sans réponse).
8. Revenir avec le compte responsable et vérifier la réponse dans **Propositions envoyées**.

## Notes de migration depuis la phase 1

- Les écrans phase 1 sont conservés (`/login`, `/missions`).
- Le listing missions continue de fonctionner pour admin/responsable.
- Le comportement côté bénévole est volontairement restreint par RLS en phase 2.
