-- Commentaire du doubleur (distinct du commentaire personnel stocké dans `message`)
alter table public.doublures add column if not exists supervisor_comment text;
