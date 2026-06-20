alter table public.skills
  add column if not exists code text,
  add column if not exists level int;

comment on column public.skills.code  is 'Sigle court du diplôme/compétence (ex: CE, PSE2)';
comment on column public.skills.level is 'Niveau hiérarchique (1=débutant … 5=expert)';
