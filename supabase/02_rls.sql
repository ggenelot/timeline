alter table public.profiles enable row level security;
alter table public.missions enable row level security;
alter table public.mission_proposals enable row level security;

-- Profiles: each user can read/update own profile. Admin can read all.
-- Responsables can list volunteers to send proposals.
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

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- Missions:
-- - admin/responsable can read all missions
-- - benevole can only read missions where they are proposed
drop policy if exists "missions_select_authenticated" on public.missions;
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

-- Missions insert/update restricted to admin/responsable.
drop policy if exists "missions_insert_admin_or_responsable" on public.missions;
create policy "missions_insert_admin_or_responsable"
on public.missions
for insert
with check (
  auth.uid() = created_by
  and public.current_user_role() in ('admin', 'responsable')
);

drop policy if exists "missions_update_creator_admin" on public.missions;
create policy "missions_update_creator_admin"
on public.missions
for update
using (
  auth.uid() = created_by
  or public.current_user_role() = 'admin'
)
with check (
  auth.uid() = created_by
  or public.current_user_role() = 'admin'
);

-- Mission proposals
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
