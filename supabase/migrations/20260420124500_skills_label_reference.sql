create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.skills
  add column if not exists label text;

update public.skills
set label = name
where label is null;

alter table public.skills
  alter column label set not null;

create unique index if not exists idx_skills_label_unique on public.skills(label);

insert into public.skills (label, name)
values
  ('PSC1', 'PSC1'),
  ('PSE1', 'PSE1'),
  ('PSE2', 'PSE2'),
  ('Logistique', 'Logistique'),
  ('Transmission', 'Transmission'),
  ('Conduite', 'Conduite'),
  ('Chef d''équipe', 'Chef d''équipe'),
  ('Régulation', 'Régulation'),
  ('Radio', 'Radio'),
  ('Soutien opérationnel', 'Soutien opérationnel')
on conflict (label) do update
set name = excluded.name;
