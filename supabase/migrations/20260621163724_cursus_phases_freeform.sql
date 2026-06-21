-- Allow free-form cursus phases (no forced pré-doublure / post-doublure).
-- Phases are now arbitrary, named, reorderable steps; `kind` becomes optional
-- and the pre/post check constraint is dropped.

alter table public.cursus_phases alter column kind drop not null;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'cursus_phases_kind_check'
  ) then
    alter table public.cursus_phases drop constraint cursus_phases_kind_check;
  end if;
end $$;
