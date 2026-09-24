# Contribuer à Timeline

Ce document décrit le workflow de contribution depuis le passage en production multi-contributeurs. Pour les règles de code (style, sécurité, migrations), voir [`AGENTS.md`](./AGENTS.md).

## Environnements

| Environnement | Branche | URL | Base de données |
|---|---|---|---|
| Production | `main` | domaine de production | Projet Supabase production |
| Preview (par PR) | branche de la PR | URL Vercel générée par PR | Branche de preview Supabase si la PR modifie `supabase/` |

Les PR ciblent directement `main` : il n'y a plus d'étape `staging` (la branche existe encore mais n'est plus utilisée). Une migration mergée est appliquée en production dans les minutes qui suivent — voir `AGENTS.md` § 7.

## Workflow de contribution

1. **Créer une branche** depuis `main` à jour :
   ```bash
   git fetch origin main
   git checkout -b feature/ma-fonctionnalite origin/main
   ```
2. **Développer et tester en local** (voir le README pour le setup Supabase local).
3. **Ouvrir une PR vers `main`**. Attendre la CI verte et, si la PR contient une migration, le check `Supabase Preview` vert.
4. **Tester sur le Preview Deployment** de la PR.
5. **Merger** (humain). La CI tourne sur `main`, `supabase-prod.yml` applique les migrations en production et Vercel déploie.

## Branches d'intégration ad-hoc

Pour une fonctionnalité qui s'étend sur plusieurs PR et qu'on ne veut pas livrer par morceaux, ouvrir une branche d'intégration depuis `main` (ex. `suivi-competences`) : les sous-PR la ciblent, puis une PR `<branche d'intégration> → main` livre l'ensemble. Voir `AGENTS.md` § 7.

## Règles

- Ne jamais pusher directement ni force-pusher sur `main`.
- Une PR qui modifie le schéma doit avoir le check `Supabase Preview` vert et rester compatible avec le code en production le temps du déploiement (voir `AGENTS.md` § 7).
- En cas de problème détecté sur `main`, corriger ou revert via une nouvelle PR (jamais de force-push ni de réécriture d'historique).

## Avant d'ouvrir une PR

```bash
npm run typecheck
npm run lint
npm test
```

Voir `AGENTS.md` § 7 pour le détail des workflows CI/CD.

## Configuration GitHub à appliquer manuellement

Les workflows ne suffisent pas seuls à empêcher un contournement humain (force-push, merge manuel sans attendre CI). Tant que ces réglages ne sont pas faits, les règles ci-dessus ne sont que des conventions documentées.

**Branche par défaut du repo** (**Settings → General → Default branch**) : `main`.

À configurer dans **Settings → Branches** :

**Branche `main` :**
- Require a pull request before merging — 1 approbation minimum.
- Require status checks to pass before merging — checks requis : `Typecheck · Lint · Build` et `check-duplicate-migration-timestamps`.
- Require branches to be up to date before merging.
- Do not allow force pushes.
- Do not allow deletions.
- (Optionnel) Restreindre qui peut merger, si l'équipe grossit.

## Configuration du projet Supabase staging (inactif)

> Le circuit `staging` n'est plus utilisé. Cette section est conservée pour mémoire, au cas où il serait réactivé.

Le déploiement des migrations passe par les workflows GitHub Actions (`supabase-staging.yml` / `supabase-prod.yml`, voir `AGENTS.md` § 7), pas par l'intégration GitHub native de Supabase. Lors de la création du projet Supabase staging :

1. Sur l'écran **GitHub Integration** du dashboard Supabase, désactiver le toggle **"Deploy to production"**. Le repo et le working directory peuvent rester liés (utile pour le lien visuel migrations ↔ commits), mais Supabase ne doit pas déployer lui-même — sinon double déploiement, avec ce projet staging pointant en plus sur la mauvaise branche (`main`).
2. Récupérer la référence du projet : **Settings → General → Reference ID**.
3. Récupérer/réinitialiser le mot de passe DB : **Settings → Database → Database password**.
4. Ajouter dans **Settings → Secrets and variables → Actions** du repo :
   - `STAGING_SUPABASE_PROJECT_ID` (reference ID de l'étape 2).
   - `STAGING_SUPABASE_DB_PASSWORD` (mot de passe de l'étape 3).
   - Vérifier que `SUPABASE_ACCESS_TOKEN` existe déjà (token de compte, partagé avec le projet production).
5. Déclencher un premier déploiement manuel pour valider le lien et appliquer tout le schéma existant : `gh workflow run supabase-staging.yml --ref staging` (sans `--ref`, la commande dispatche le workflow tel qu'il existe sur la branche par défaut du dépôt — `main` — et non sur `staging`).
6. Dans **Auth → URL Configuration** du projet staging, renseigner le Site URL et les Redirect URLs avec l'URL stable de la branche `staging` sur Vercel (et un wildcard pour les Preview Deployments par PR si besoin).
7. Répliquer manuellement depuis le projet production ce qui n'est pas couvert par les migrations : providers Auth (ex. Slack SSO), buckets Storage, extensions activées hors migration.
8. Dans Vercel, ajouter les variables d'environnement (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) pointant vers ce projet staging, scopées à l'environnement Preview — distinctes des variables Production.
