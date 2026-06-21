alter table public.cursus_phases add column if not exists min_externe int not null default 0;

update public.cursus_phases set min_externe = 1 where require_externe is true;

alter table public.cursus_phases add constraint cursus_phases_min_externe_check check (min_externe >= 0 and min_externe <= min_doublures);

alter table public.cursus_phases drop column require_externe;

alter table public.cursus drop column if exists formation_label;
alter table public.cursus drop column if exists formation_required;
