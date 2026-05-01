alter table public.mission_assignments
  add column if not exists mission_required_skill_id uuid null references public.mission_required_skills(id) on delete set null;

create index if not exists idx_mission_assignments_required_skill_id on public.mission_assignments(mission_required_skill_id);
