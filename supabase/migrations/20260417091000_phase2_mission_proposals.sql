DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mission_proposal_response') THEN
    CREATE TYPE public.mission_proposal_response AS ENUM ('no_response', 'available', 'unavailable', 'maybe');
  END IF;
END
$$;

create table if not exists public.mission_proposals (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  volunteer_id uuid not null references public.profiles(id) on delete cascade,
  proposed_by uuid not null references public.profiles(id) on delete cascade,
  response public.mission_proposal_response not null default 'no_response',
  responded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.mission_proposals
  drop constraint if exists mission_proposals_mission_volunteer_key;

alter table public.mission_proposals
  add constraint mission_proposals_mission_volunteer_key unique (mission_id, volunteer_id);

create index if not exists idx_mission_proposals_mission_id on public.mission_proposals(mission_id);
create index if not exists idx_mission_proposals_volunteer_id on public.mission_proposals(volunteer_id);

alter table public.mission_proposals enable row level security;

-- Phase 2 keeps profile behavior where responsables can list volunteers.
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
using (
  auth.uid() = id
  or public.current_user_role() = 'admin'
  or (
    public.current_user_role() = 'responsable'
    and role = 'benevole'
  )
);

-- Phase 2 mission visibility: benevoles only see proposed missions.
drop policy if exists "missions_select_by_role" on public.missions;
create policy "missions_select_by_role"
on public.missions
for select
using (
  public.current_user_role() in ('admin', 'responsable')
  or (
    public.current_user_role() = 'benevole'
    and exists (
      select 1
      from public.mission_proposals mp
      where mp.mission_id = missions.id
      and mp.volunteer_id = auth.uid()
    )
  )
);

-- Select:
-- - admin can read all
-- - responsable can read proposals of their missions
-- - benevole can read only own proposals
drop policy if exists "mission_proposals_select_strict" on public.mission_proposals;
create policy "mission_proposals_select_strict"
on public.mission_proposals
for select
using (
  public.current_user_role() = 'admin'
  or (
    public.current_user_role() = 'responsable'
    and exists (
      select 1 from public.missions m
      where m.id = mission_proposals.mission_id
      and m.created_by = auth.uid()
    )
  )
  or (
    public.current_user_role() = 'benevole'
    and volunteer_id = auth.uid()
  )
);

-- Insert:
-- - admin can insert all
-- - responsable can propose only on own missions and only to volunteers
drop policy if exists "mission_proposals_insert_strict" on public.mission_proposals;
create policy "mission_proposals_insert_strict"
on public.mission_proposals
for insert
with check (
  public.current_user_role() = 'admin'
  or (
    public.current_user_role() = 'responsable'
    and proposed_by = auth.uid()
    and exists (
      select 1 from public.missions m
      where m.id = mission_proposals.mission_id
      and m.created_by = auth.uid()
    )
    and exists (
      select 1 from public.profiles p
      where p.id = mission_proposals.volunteer_id
      and p.role = 'benevole'
    )
  )
);

-- Update:
-- - admin can update all
-- - responsable can update proposals of their missions
-- - benevole can update only own proposals (response workflow)
drop policy if exists "mission_proposals_update_strict" on public.mission_proposals;
create policy "mission_proposals_update_strict"
on public.mission_proposals
for update
using (
  public.current_user_role() = 'admin'
  or (
    public.current_user_role() = 'responsable'
    and exists (
      select 1 from public.missions m
      where m.id = mission_proposals.mission_id
      and m.created_by = auth.uid()
    )
  )
  or (
    public.current_user_role() = 'benevole'
    and volunteer_id = auth.uid()
  )
)
with check (
  public.current_user_role() = 'admin'
  or (
    public.current_user_role() = 'responsable'
    and exists (
      select 1 from public.missions m
      where m.id = mission_proposals.mission_id
      and m.created_by = auth.uid()
    )
  )
  or (
    public.current_user_role() = 'benevole'
    and volunteer_id = auth.uid()
  )
);
