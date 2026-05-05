-- Remove legacy uncategorized skills and enforce categorized skills only.

-- Remove dangling assignments tied to uncategorized skills first.
delete from public.profile_skills ps
using public.skills s
where ps.skill_id = s.id
  and s.category is null;

delete from public.mission_required_skills mrs
using public.skills s
where mrs.skill_id = s.id
  and s.category is null;

-- Remove uncategorized skills.
delete from public.skills
where category is null;

-- Enforce categories for all future skills.
alter table public.skills
  alter column category set not null;
