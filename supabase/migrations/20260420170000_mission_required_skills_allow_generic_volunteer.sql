alter table public.mission_required_skills
  drop constraint if exists mission_required_skills_skill_id_fkey;

alter table public.mission_required_skills
  alter column skill_id drop not null;

alter table public.mission_required_skills
  add constraint mission_required_skills_skill_id_fkey
  foreign key (skill_id)
  references public.skills(id)
  on delete set null;
