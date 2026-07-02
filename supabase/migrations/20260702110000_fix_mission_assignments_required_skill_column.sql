-- Le suivi d'historique des migrations en prod avait marqué
-- 20260430201000_mission_assignments_add_required_skill_reference comme
-- appliquée sans que son DDL ait réellement tourné (placeholder de
-- réconciliation). La colonne manquait donc en prod alors que le code et
-- staging la supposent présente, cassant la confirmation d'équipage.
alter table public.mission_assignments
  add column if not exists mission_required_skill_id uuid null references public.mission_required_skills(id) on delete set null;

create index if not exists idx_mission_assignments_required_skill_id on public.mission_assignments(mission_required_skill_id);
