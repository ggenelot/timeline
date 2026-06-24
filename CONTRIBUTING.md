# Contribuer à Timeline

Ce document décrit le workflow de contribution depuis le passage en production multi-contributeurs. Pour les règles de code (style, sécurité, migrations), voir [`AGENTS.md`](./AGENTS.md).

## Environnements

| Environnement | Branche | URL | Base de données |
|---|---|---|---|
| Production | `main` | domaine de production | Projet Supabase production |
| Staging | `staging` | URL Vercel stable de la branche `staging` | Projet Supabase staging |
| Preview (par PR) | branche de la PR | URL Vercel générée par PR | Projet Supabase staging (partagé) |

Le Preview Deployment d'une PR partage la base staging avec toutes les autres PR en cours. Si une PR ajoute une migration, celle-ci n'est appliquée qu'au merge dans `staging` — la preview de cette PR peut donc ne pas refléter le nouveau schéma avant le merge.

## Workflow de contribution

1. **Créer une branche** depuis `staging` (pas depuis `main`) :
   ```bash
   git checkout staging
   git pull origin staging
   git checkout -b feature/ma-fonctionnalite
   ```
2. **Développer et tester en local** (voir le README pour le setup Supabase local).
3. **Ouvrir une PR vers `staging`**.
   - Les branches `claude/` et `codex/` sont auto-mergées dès que CI passe (sauf label `do-not-merge`).
   - Les autres branches (`feature/`, `fix/`) demandent une review humaine avant merge.
4. **Vérifier sur l'environnement staging** une fois la PR mergée : la migration (s'il y en a une) est appliquée automatiquement, et le déploiement staging est mis à jour.
5. **Promotion en production** : une fois que `staging` est jugé stable, ouvrir une PR `staging → main`. Cette PR est **toujours revue et mergée manuellement** par un humain, jamais auto-mergée. Une fois mergée, les migrations déjà validées sur staging sont rejouées automatiquement sur le projet Supabase production.

## Branches d'intégration ad-hoc

Pour une fonctionnalité qui s'étend sur plusieurs PR ou plusieurs sessions de travail, ouvrir une branche d'intégration dédiée depuis `staging` (ex. `suivi-competences`) plutôt que de viser `staging` à chaque sous-PR :

- Toutes les sous-PR de la fonctionnalité ciblent cette branche d'intégration comme base, pas `staging` directement.
- Une fois la fonctionnalité complète et validée, ouvrir une PR `<branche d'intégration> → staging`.
- La promotion `staging → main` se fait ensuite normalement (revue humaine, jamais d'auto-merge).

Voir `AGENTS.md` § 7 pour le détail. Cette convention s'applique aussi aux agents IA : si une fonctionnalité est déjà en cours sur une branche d'intégration ad-hoc, les PR suivantes doivent cibler cette branche, pas `main` ni `staging`.

## Règles

- Ne jamais ouvrir de PR de feature directement vers `main`.
- Ne jamais force-push sur `staging` ou `main`.
- Une PR qui modifie le schéma (nouvelle migration) doit être testée sur staging avant la promotion vers `main`.
- En cas de problème détecté sur `main` après une promotion, revert via une nouvelle PR (jamais de force-push ni de rewrite d'historique).

## Avant d'ouvrir une PR

```bash
npm run typecheck
npm run lint
npm test
```

Voir `AGENTS.md` § 7 pour le détail des workflows CI/CD.

## Configuration GitHub à appliquer manuellement

Les workflows ne suffisent pas seuls à empêcher un contournement humain (force-push, merge manuel sans attendre CI). Tant que ces réglages ne sont pas faits, les règles ci-dessus ne sont que des conventions documentées.

**Branche par défaut du repo** (**Settings → General → Default branch**) : mettre `staging`, pas `main`. C'est la branche que GitHub propose par défaut comme base de PR et comme point de départ pour une nouvelle branche — y compris pour les agents IA qui n'ont pas reçu d'instruction explicite. La garder sur `main` pousse les agents à créer leurs branches et PR depuis/vers `main` par défaut, ce qui contredit directement le reste de ce document.

À configurer dans **Settings → Branches** :

**Branche `main` :**
- Require a pull request before merging — 1 approbation minimum.
- Require status checks to pass before merging — checks requis : `Typecheck · Lint · Build` et `check-duplicate-migration-timestamps`.
- Require branches to be up to date before merging.
- Do not allow force pushes.
- Do not allow deletions.
- (Optionnel) Restreindre qui peut merger, si l'équipe grossit.

**Branche `staging` :**
- Require status checks to pass before merging — mêmes checks que ci-dessus. C'est de la défense en profondeur : `auto-merge.yml` attend déjà lui-même la fin des checks (`gh pr checks --watch`), mais ce réglage empêche aussi qu'un merge manuel par un humain contourne la vérification.
- Do not allow force pushes.
- Pas de "require pull request review" : l'auto-merge des agents doit continuer à fonctionner sans approbation humaine.

## Configuration du projet Supabase staging

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

### Piège : scope par branche vs "All Preview Deployments"

Dans Vercel, une variable scopée "Preview" peut en plus être restreinte à **une branche précise** (un sélecteur de branche apparaît sous le nom de la variable dans la liste). Deux erreurs vécues lors de la mise en place :

- **Une variable Preview restreinte à une seule branche ne s'applique qu'aux previews de cette branche.** Toute autre branche retombe sur une autre entrée existante pour la même clé (souvent une vieille variable "All Environments" qui pointe vers la prod) — d'où des previews qui s'authentifient silencieusement contre la production. Pour que les valeurs staging s'appliquent à toutes les previews, il faut choisir **"All Preview Deployments"**, pas une branche spécifique.
- **Une variable historique scopée "All Environments" couvre aussi Production.** En retirant son scope Preview pour ne garder que Production, bien vérifier que la case "Production" reste cochée et que la valeur de production est conservée — sinon le prochain build sur `main` échoue avec `Missing NEXT_PUBLIC_SUPABASE_URL environment variable` (l'erreur vient de `lib/supabase/server.ts`, levée au moment du `next build`, qui ne distingue pas les scopes : il échoue dès que la variable est absente pour l'environnement en cours de build).

Après toute modification de scope sur `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`, vérifier qu'il existe bien une entrée couvrant Production (avec la valeur prod) et une couvrant "All Preview Deployments" (avec la valeur staging), puis redéclencher un build sur `main` et sur une preview pour confirmer.

### Tester une preview pointant vers staging

Le projet staging a sa propre base Auth, distincte de la production — les comptes humains réels (ex. comptes Slack synchronisés) n'y existent pas. Pour tester :

1. Si le projet staging n'a pas encore été initialisé avec les données de démo, lancer `npm run demo:setup` (ou au minimum `npm run demo:create-test-accounts`) avec les variables d'environnement pointant vers le projet staging (`--force` requis par `create-test-accounts.mjs` car l'URL ne ressemble pas à une instance locale — à utiliser uniquement sur staging, jamais sur la prod).
2. Se connecter sur la preview avec les comptes fixes suivants (mot de passe `DemoPass123!` pour tous) :

   | Identifiant | Rôle | Usage |
   |---|---|---|
   | `admin` | Admin | tout voir et tout faire, `/admin/volunteers`, `/admin/gestion`, `/admin/competences` |
   | `responsable` | Responsable | gérer ses missions, valider les propositions (`/missions`) |
   | `benevole` / `benevole2` / `benevole3` | Bénévole | répondre aux missions proposées, `/my-missions` |

   Voir le README (§ "Comptes de démonstration" et "Parcours de test manuel") pour le détail des parcours par rôle.
3. Ne jamais utiliser de comptes humains réels (ex. Clara, Gabriel.g) pour vérifier qu'une preview est bien isolée de la prod : si la connexion réussit avec un compte réel, c'est le signe que la preview pointe encore vers la production (cf. piège de scope ci-dessus).
