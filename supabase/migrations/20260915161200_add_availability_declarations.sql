-- Déclaration de disponibilité longue durée des bénévoles : tendance
-- indicative 0-3 par jour sur les prochains mois, sans lien ni engagement
-- vis-à-vis des missions (cf. mission_proposals pour la réponse qui, elle,
-- engage). Un bénévole ne gère que ses propres lignes ; la vue agrégée pour
-- les responsables passe par une route API service-role (/api/admin/availability),
-- pas par une policy RLS élargie — même logique de gating que le reste de /admin/*.

create table if not exists public.availability_declarations (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  level smallint not null check (level between 0 and 3),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint availability_declarations_volunteer_day_key unique (volunteer_id, day)
);

create index if not exists idx_availability_declarations_volunteer_id
  on public.availability_declarations(volunteer_id);
create index if not exists idx_availability_declarations_day
  on public.availability_declarations(day);

alter table public.availability_declarations enable row level security;

drop policy if exists "availability_declarations_select_own_or_admin" on public.availability_declarations;
create policy "availability_declarations_select_own_or_admin"
on public.availability_declarations
for select
using (public.is_admin(auth.uid()) or volunteer_id = auth.uid());

drop policy if exists "availability_declarations_write_own_or_admin" on public.availability_declarations;
create policy "availability_declarations_write_own_or_admin"
on public.availability_declarations
for all
using (public.is_admin(auth.uid()) or volunteer_id = auth.uid())
with check (public.is_admin(auth.uid()) or volunteer_id = auth.uid());
