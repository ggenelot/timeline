alter table public.missions
add column if not exists retained_status text,
add column if not exists source_type_label text;

create index if not exists idx_missions_dedup_lookup
on public.missions (
  lower(regexp_replace(btrim(title), '\\s+', ' ', 'g')),
  ((starts_at at time zone 'Europe/Paris')::date)
);
