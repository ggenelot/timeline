-- Remove deprecated "autres" skill family and keep only 4 families.
-- Also normalize legacy "technique" category to "conduite".
--
-- Guarded on the legacy "category" text column (later dropped in favor of
-- category_id by 20260517100000_skill_categories_refactor.sql): on a fresh
-- database this column never existed, so there is no legacy data to clean.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'skills' and column_name = 'category'
  ) then
    update public.skills
    set category = 'conduite'
    where lower(coalesce(category, '')) = 'technique';

    -- Remove legacy "autres" skills from all relations (cascade through FKs).
    delete from public.skills
    where lower(coalesce(category, '')) in ('autre', 'autres')
       or lower(trim(name)) in (
         'logistique',
         'radio',
         'régulation',
         'regulation',
         'soutien opérationnel',
         'soutien operationnel',
         'transmission',
         'chef d''équipe'
       );
  end if;
end
$$;
