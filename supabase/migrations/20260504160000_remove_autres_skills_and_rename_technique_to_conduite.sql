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
