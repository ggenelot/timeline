alter table public.skills
  add column if not exists description text;

comment on column public.skills.description is 'Description détaillée affichée dans le suivi des compétences (critères, contenu, etc.)';
