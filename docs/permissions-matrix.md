# Matrice des permissions

Document de référence de la refonte des rôles (permissions modulaires par
ressource). Mis à jour à chaque phase de migration ; sert aussi de checklist
de test manuel.

## Modèle

- **Rôles cumulables** : chaque bénévole garde son activité de base et peut
  cumuler des rôles complémentaires (`roles` / `profile_roles`).
- **Comportements** = permission (`role_behaviors`) : une ligne
  `(rôle, ressource, action)`.
- **Ressources** (`role_behavior_resource_type`) : `mission`, `cursus`,
  `materiel`, `volunteer`, `skill`, `mission_type`, `settings`,
  `administration`.
- **Actions** : `can_see` (lecture), `can_create` (création), `can_manage`
  (édition + suppression + validation). **`can_manage` implique `can_see`**
  (résolu dans `has_permission()` et dans l'aplatissement de
  `/api/roles/mine`).
- **Spécifique missions** : scoping par `mission_type_ids` / `mission_statuses`
  (vide = tous) + comportements `required_for_visibility` et `auto_slack`.
  ⚠ `mission/can_see` sert à la visibilité *timeline* des bénévoles de base :
  il n'ouvre aucune page de gestion.
- **Rôle système « Administrateur »** (`roles.is_system`) : tous les droits,
  implicites — pas de lignes de comportements (interdit par trigger). Unique,
  non supprimable, nom figé, jamais 0 membre.

## Fonctions de vérification (source de vérité unique)

| Fonction SQL | Usage |
|---|---|
| `is_admin(_user_id)` | membre du rôle système |
| `has_permission(_user_id, _resource, _action)` | permission générique (admin implicite, manage ⇒ see) |
| `can_read_mission` / `can_manage_mission` | décisions par mission (scoping type/statut) |

Côté code : `requirePermission()` / `requireMissionPermission()`
(`lib/api/permissions.ts`) pour les routes API service-role ;
`usePermissions().can()` (`lib/permissions/permissions-context.tsx`) pour le
gating UX client.

## État de la migration par domaine

| Phase | Domaine | Policies RLS | Routes API | UI | État |
|---|---|---|---|---|---|
| 0 | Fondation (rôle système, fonctions, garde-fous, sidebar, UI rôles) | — | — | ✔ | **Fait** |
| 1 | Matériel | ✔ `has_permission('materiel',…)` | ✔ `requirePermission` | ✔ `usePermissions` | **Fait** |
| 2 | Compétences (catalogue) | ✔ `has_permission('skill',…)` | ✔ `requirePermission` | ✔ `usePermissions` | **Fait** |
| 3 | Cursus | ✔ `has_permission('cursus',…)` (+ can_see en lecture) | ✔ `requirePermission` | ✔ `usePermissions` | **Fait** |
| 4 | Bénévoles / profils | ✔ `has_permission('volunteer',…)` | ✔ `requirePermission` | ✔ `usePermissions` | **Fait** |
| 5 | Missions + types de mission | ✔ `is_admin`/`can_manage_mission`/`has_permission('mission_type',…)` | ✔ `requirePermission`/`requireMissionPermission`/`requireAdmin` | ✔ `usePermissions` | **Fait (PR B1)** |
| 6 | Réglages / aide / Slack / administration | ✔ `has_permission('settings'/'administration',…)` | ✔ `requirePermission` + edge functions | ✔ `usePermissions` | **Fait** |
| 7 | Suppression de `profiles.role` | — | — | — | À faire |

Tant qu'un domaine n'est pas migré, ses gardes restent le rôle global legacy
(`profiles.role='admin'`) ; l'équivalence est garantie par le backfill de la
phase 0 (membre du rôle système ≡ `role='admin'`).

> **Rôle « voit tout, ne gère rien »** : purement composé — `can_see` sur les
> 8 ressources (bouton preset « Lecture sur tout »). Aucune logique dédiée. Ce
> rôle voit : catalogues (lecture publique), suivi compétences/cursus (tableau
> de bord), profils et compétences des bénévoles (RLS + page de détail),
> matériel, réglages. Les **éditeurs** (référentiel cursus, console bénévoles
> avec sync Slack, catalogue compétences) restent gardés par `can_manage` : la
> donnée reste visible ailleurs en lecture, mais ces consoles de gestion ne
> s'ouvrent pas en lecture seule.

## Matrice cible (personas de référence)

| Ressource × action | Admin (rôle système) | Superviseur lecture (`can_see` × 8) | Respo maraude (`can_see`+`can_create`+`can_manage` mission, scope maraude) | Respo matériel (`can_manage` materiel) | Bénévole (rôle par défaut) |
|---|---|---|---|---|---|
| mission — voir | ✔ toutes | ✔ toutes | ✔ (maraudes) | timeline seule | timeline seule |
| mission — créer | ✔ | ✖ | ✔ (maraudes) | ✖ | brouillons si `can_create` |
| mission — gérer | ✔ | ✖ | ✔ (maraudes) | ✖ | ✖ |
| cursus — voir | ✔ | ✔ | ✖ | ✖ | le sien |
| cursus — gérer | ✔ | ✖ | ✖ | ✖ | ✖ |
| materiel — voir | ✔ | ✔ | ✖ | ✔ (implicite) | catalogue public |
| materiel — gérer | ✔ | ✖ | ✖ | ✔ | ✖ |

Détail phase 1 (fait) : `materiel/can_manage` gouverne le catalogue
(`materiel_categories`, `materiel_types`, `materiel_type_contents`) **et** les
listes matériel des missions (`mission_required_materiels`,
`mission_materiel_assignments`, board OPE). `mission_type_required_materiels`
reste admin-only jusqu'à la phase 5 (ressource `mission_type`). La
vérification matériel reste ouverte aux bénévoles confirmés sur la mission
(`can_verify_mission_materiel`, branche admin passée sur `is_admin()`).
| volunteer — voir | ✔ | ✔ | (phase 4/5 : profils bénévoles pour staffer) | ✖ | ✖ |
| volunteer — gérer | ✔ | ✖ | ✖ | ✖ | ✖ |
| skill — gérer | ✔ | ✖ | ✖ | ✖ | ✖ |
| mission_type — gérer | ✔ | ✖ | ✖ | ✖ | ✖ |
| settings — gérer | ✔ | ✖ | ✖ | ✖ | ✖ |
| administration — gérer | ✔ | ✖ | ✖ | ✖ | ✖ |

Exceptions « lecture publique » déjà en place (RLS `authenticated using(true)`) :
catalogue skills, catalogue matériel, types de mission, pages d'aide,
`app_settings`.

## Points d'application

| Surface | Garde effective |
|---|---|
| Écritures directes client (missions, propositions) | **RLS** (⚠ 0 ligne modifiée sans erreur si refusé — assertions de row-count à ajouter en phase 5) |
| Routes `app/api/admin/*` (client service-role) | **Code uniquement** (`requirePermission` — la RLS est bypassée) |
| Sidebar / pages | UX seulement, jamais une garde de sécurité |

## Runbook break-glass

Si tous les administrateurs sont perdus (le trigger empêche normalement de
retirer le dernier membre) : SQL direct en tant que `postgres` —

```sql
insert into public.profile_roles (profile_id, role_id)
select '<profile_id>', r.id from public.roles r where r.is_system;
```

Les triggers de protection (`roles_guard_system`,
`profile_roles_guard_system`, `role_behaviors_guard_system`) peuvent être
suspendus par un superuser via `alter table … disable trigger …` le temps
d'une réparation, jamais depuis l'application.
