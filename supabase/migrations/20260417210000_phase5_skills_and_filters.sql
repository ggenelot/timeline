create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profile_skills (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint profile_skills_profile_skill_key unique (profile_id, skill_id)
);

create index if not exists idx_profile_skills_profile_id on public.profile_skills(profile_id);
create index if not exists idx_profile_skills_skill_id on public.profile_skills(skill_id);

create table if not exists public.mission_required_skills (
  mission_id uuid not null references public.missions(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint mission_required_skills_mission_skill_key unique (mission_id, skill_id)
);

create index if not exists idx_mission_required_skills_mission_id on public.mission_required_skills(mission_id);
create index if not exists idx_mission_required_skills_skill_id on public.mission_required_skills(skill_id);

create or replace function public.can_read_mission(_mission_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    public.current_user_role() in ('admin', 'responsable')
    or (
      public.current_user_role() = 'benevole'
      and public.is_mission_proposed_to(_mission_id, _user_id)
    )
  );
$$;

revoke all on function public.can_read_mission(uuid, uuid) from public;
grant execute on function public.can_read_mission(uuid, uuid) to authenticated;

alter table public.skills enable row level security;
alter table public.profile_skills enable row level security;
alter table public.mission_required_skills enable row level security;

drop policy if exists "skills_select_authenticated" on public.skills;
create policy "skills_select_authenticated"
on public.skills
for select
using (public.current_user_role() in ('admin', 'responsable', 'benevole'));

drop policy if exists "skills_write_admin_only" on public.skills;
create policy "skills_write_admin_only"
on public.skills
for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "profile_skills_select_strict" on public.profile_skills;
create policy "profile_skills_select_strict"
on public.profile_skills
for select
using (
  public.current_user_role() = 'admin'
  or profile_skills.profile_id = auth.uid()
  or (
    public.current_user_role() = 'responsable'
    and exists (
      select 1
      from public.profiles p
      where p.id = profile_skills.profile_id
        and p.role = 'benevole'
    )
  )
);

drop policy if exists "profile_skills_write_admin_only" on public.profile_skills;
create policy "profile_skills_write_admin_only"
on public.profile_skills
for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "mission_required_skills_select_strict" on public.mission_required_skills;
create policy "mission_required_skills_select_strict"
on public.mission_required_skills
for select
using (public.can_read_mission(mission_required_skills.mission_id, auth.uid()));

drop policy if exists "mission_required_skills_write_manage_mission" on public.mission_required_skills;
create policy "mission_required_skills_write_manage_mission"
on public.mission_required_skills
for all
using (public.can_manage_mission(mission_required_skills.mission_id, auth.uid()))
with check (public.can_manage_mission(mission_required_skills.mission_id, auth.uid()));
