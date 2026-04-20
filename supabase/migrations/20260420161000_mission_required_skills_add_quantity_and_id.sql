alter table public.mission_required_skills
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists quantity integer not null default 1;

update public.mission_required_skills
set quantity = 1
where quantity is null;

alter table public.mission_required_skills
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column quantity set not null,
  add constraint mission_required_skills_pkey primary key (id),
  add constraint mission_required_skills_quantity_check check (quantity > 0);
