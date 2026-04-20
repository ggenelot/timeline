alter table public.missions
add column if not exists do_status text,
add column if not exists requirements_notes text,
add column if not exists equipment_notes text,
add column if not exists reversion_expected numeric,
add column if not exists reversion_actual numeric,
add column if not exists validation_date date,
add column if not exists raw_import_payload jsonb,
add column if not exists import_batch_id uuid;

create index if not exists idx_missions_import_batch_id on public.missions(import_batch_id);
