-- Tableau de bord de suivi des compétences.
-- Le dashboard manipule 4 statuts métier : validée, en formation, intéressé·e,
-- à recycler. On élargit la contrainte de `profile_skills.status` pour accepter
-- les deux nouveaux statuts ('formation', 'a_recycler') tout en conservant les
-- valeurs historiques ('a_faire', 'exempte') afin de ne perdre aucune donnée.

alter table public.profile_skills
  drop constraint if exists profile_skills_status_check;

alter table public.profile_skills
  add constraint profile_skills_status_check
    check (status in ('valide', 'a_faire', 'interesse', 'exempte', 'formation', 'a_recycler'));
