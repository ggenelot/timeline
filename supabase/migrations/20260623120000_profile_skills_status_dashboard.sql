-- Tableau de bord de suivi des compétences.
-- Le dashboard manipule 4 statuts métier : validée, en formation, intéressé·e,
-- à recycler. On élargit la contrainte de `profile_skills.status` pour accepter
-- les deux nouveaux statuts ('formation', 'a_recycler') tout en conservant les
-- valeurs historiques ('a_faire', 'exempte') afin de ne perdre aucune donnée.
--
-- Robustesse : sur certains environnements la colonne `status` (ajoutée par
-- 20260505120000_sheet_sync_skills) n'a jamais été matérialisée. On la (re)crée
-- donc si nécessaire, en basculant les lignes existantes sur 'valide'.

alter table public.profile_skills
  add column if not exists status text not null default 'valide';

alter table public.profile_skills
  drop constraint if exists profile_skills_status_check;

alter table public.profile_skills
  add constraint profile_skills_status_check
    check (status in ('valide', 'a_faire', 'interesse', 'exempte', 'formation', 'a_recycler'));
