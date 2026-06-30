-- Remove legacy uncategorized skills and enforce categorized skills only.
--
-- Guarded on the legacy "category" text column (later dropped in favor of
-- category_id by 20260517100000_skill_categories_refactor.sql): on a fresh
-- database this column never existed, so there is nothing to enforce here.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'skills' and column_name = 'category'
  ) then
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
  end if;
end
$$;
