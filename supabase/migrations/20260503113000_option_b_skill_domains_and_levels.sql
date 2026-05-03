create table if not exists public.skill_domains (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  color text not null,
  display_order integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint skill_domains_code_check check (code ~ '^[a-z0-9-]+$')
);

create table if not exists public.skill_levels (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.skill_domains(id) on delete cascade,
  code text not null unique,
  name text not null,
  rank integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint skill_levels_code_check check (code ~ '^[a-z0-9-]+$'),
  constraint skill_levels_unique_domain_rank unique (domain_id, rank)
);

create index if not exists idx_skill_levels_domain_id on public.skill_levels(domain_id);

create table if not exists public.profile_domain_progress (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  domain_id uuid not null references public.skill_domains(id) on delete cascade,
  level_id uuid not null references public.skill_levels(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profile_domain_progress_pk primary key (profile_id, domain_id)
);

create table if not exists public.mission_required_levels (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  domain_id uuid not null references public.skill_domains(id) on delete cascade,
  min_level_id uuid not null references public.skill_levels(id) on delete restrict,
  quantity integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint mission_required_levels_quantity_check check (quantity > 0),
  constraint mission_required_levels_unique_mission_domain unique (mission_id, domain_id)
);

create index if not exists idx_mission_required_levels_mission_id on public.mission_required_levels(mission_id);
create index if not exists idx_mission_required_levels_domain_id on public.mission_required_levels(domain_id);

-- RLS
alter table public.skill_domains enable row level security;
alter table public.skill_levels enable row level security;
alter table public.profile_domain_progress enable row level security;
alter table public.mission_required_levels enable row level security;

drop policy if exists "skill_domains_select_authenticated" on public.skill_domains;
create policy "skill_domains_select_authenticated"
on public.skill_domains
for select
using (public.current_user_role() in ('admin', 'responsable', 'benevole'));

drop policy if exists "skill_domains_write_admin_only" on public.skill_domains;
create policy "skill_domains_write_admin_only"
on public.skill_domains
for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "skill_levels_select_authenticated" on public.skill_levels;
create policy "skill_levels_select_authenticated"
on public.skill_levels
for select
using (public.current_user_role() in ('admin', 'responsable', 'benevole'));

drop policy if exists "skill_levels_write_admin_only" on public.skill_levels;
create policy "skill_levels_write_admin_only"
on public.skill_levels
for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "profile_domain_progress_select_strict" on public.profile_domain_progress;
create policy "profile_domain_progress_select_strict"
on public.profile_domain_progress
for select
using (
  public.current_user_role() = 'admin'
  or profile_domain_progress.profile_id = auth.uid()
  or (
    public.current_user_role() = 'responsable'
    and exists (
      select 1
      from public.profiles p
      where p.id = profile_domain_progress.profile_id
        and p.role = 'benevole'
    )
  )
);

drop policy if exists "profile_domain_progress_write_admin_only" on public.profile_domain_progress;
create policy "profile_domain_progress_write_admin_only"
on public.profile_domain_progress
for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "mission_required_levels_select_strict" on public.mission_required_levels;
create policy "mission_required_levels_select_strict"
on public.mission_required_levels
for select
using (public.can_read_mission(mission_required_levels.mission_id, auth.uid()));

drop policy if exists "mission_required_levels_write_manage_mission" on public.mission_required_levels;
create policy "mission_required_levels_write_manage_mission"
on public.mission_required_levels
for all
using (public.can_manage_mission(mission_required_levels.mission_id, auth.uid()))
with check (public.can_manage_mission(mission_required_levels.mission_id, auth.uid()));

-- Referential data
insert into public.skill_domains (code, name, color, display_order)
values
  ('conduite', 'Conduite', 'gris', 1),
  ('operationnel', 'Opérationnel', 'orange', 2),
  ('formation', 'Formation', 'bleu', 3),
  ('accso', 'ACCSO', 'violet', 4)
on conflict (code) do update
set
  name = excluded.name,
  color = excluded.color,
  display_order = excluded.display_order,
  updated_at = timezone('utc', now());

with domain_refs as (
  select id, code from public.skill_domains
)
insert into public.skill_levels (domain_id, code, name, rank)
values
  ((select id from domain_refs where code = 'conduite'), 'conducteur-vl', 'chauffeur VL', 1),
  ((select id from domain_refs where code = 'conduite'), 'conducteur-cps', 'chauffeur CPS', 2),
  ((select id from domain_refs where code = 'operationnel'), 'psc', 'PSC1', 1),
  ((select id from domain_refs where code = 'operationnel'), 'pse1', 'PSE1', 2),
  ((select id from domain_refs where code = 'operationnel'), 'pse2', 'PSE2', 3),
  ((select id from domain_refs where code = 'operationnel'), 'ce', 'CE', 4),
  ((select id from domain_refs where code = 'operationnel'), 'cp', 'CP', 5),
  ((select id from domain_refs where code = 'operationnel'), 'ceps', 'CEPS', 6),
  ((select id from domain_refs where code = 'formation'), 'aide-formateur', 'aide-formateur', 1),
  ((select id from domain_refs where code = 'formation'), 'formateur-psc', 'formateur PSC1', 2),
  ((select id from domain_refs where code = 'formation'), 'formateur-ps', 'formateur PS', 3),
  ((select id from domain_refs where code = 'accso'), '3s', '3S', 1),
  ((select id from domain_refs where code = 'accso'), 'ces2', 'CES2', 2)
on conflict (code) do update
set
  domain_id = excluded.domain_id,
  name = excluded.name,
  rank = excluded.rank,
  updated_at = timezone('utc', now());

-- Backfill profile progression from current explicit skills: keep highest level per domain.
with explicit_levels as (
  select
    ps.profile_id,
    sl.domain_id,
    sl.id as level_id,
    sl.rank,
    row_number() over (partition by ps.profile_id, sl.domain_id order by sl.rank desc) as rn
  from public.profile_skills ps
  join public.skills s on s.id = ps.skill_id
  join public.skill_levels sl on lower(trim(s.name)) = lower(trim(sl.name))
), highest_levels as (
  select profile_id, domain_id, level_id
  from explicit_levels
  where rn = 1
)
insert into public.profile_domain_progress (profile_id, domain_id, level_id)
select profile_id, domain_id, level_id
from highest_levels
on conflict (profile_id, domain_id) do update
set
  level_id = excluded.level_id,
  updated_at = timezone('utc', now());

-- Backfill mission requirements to domain/min level.
with mission_requirements as (
  select
    mrs.mission_id,
    sl.domain_id,
    sl.id as min_level_id,
    coalesce(mrs.quantity, 1) as quantity,
    row_number() over (partition by mrs.mission_id, sl.domain_id order by sl.rank asc) as rn
  from public.mission_required_skills mrs
  join public.skills s on s.id = mrs.skill_id
  join public.skill_levels sl on lower(trim(s.name)) = lower(trim(sl.name))
), selected_requirements as (
  select mission_id, domain_id, min_level_id, quantity
  from mission_requirements
  where rn = 1
)
insert into public.mission_required_levels (mission_id, domain_id, min_level_id, quantity)
select mission_id, domain_id, min_level_id, quantity
from selected_requirements
on conflict (mission_id, domain_id) do update
set
  min_level_id = excluded.min_level_id,
  quantity = excluded.quantity,
  updated_at = timezone('utc', now());
