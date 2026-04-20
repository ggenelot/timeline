alter table public.missions
add column if not exists retained_status text,
add column if not exists source_type_label text;
