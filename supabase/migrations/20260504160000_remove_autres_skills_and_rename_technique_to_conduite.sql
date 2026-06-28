-- Fresh-apply guard : la colonne skills.category n'est créée par AUCUNE migration
-- (elle a été ajoutée manuellement sur la prod historique). On la crée si absente
-- pour rendre la chaîne rejouable depuis zéro (bootstrap d'un projet Supabase vierge).
-- No-op sur la prod où la colonne existe déjà ; elle est supprimée plus tard par
-- 20260517100000_skill_categories_refactor.sql.
alter table public.skills add column if not exists category text;

-- Remove deprecated "autres" skill family and keep only 4 families.
-- Also normalize legacy "technique" category to "conduite".

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
