DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mission_assignment_status') THEN
    CREATE TYPE public.mission_assignment_status AS ENUM ('selected', 'confirmed', 'declined', 'replaced');
  END IF;
END
$$;

create table if not exists public.mission_assignments (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  volunteer_id uuid not null references public.profiles(id) on delete cascade,
  assignment_status public.mission_assignment_status not null default 'selected',
  created_at timestamptz not null default timezone('utc', now()),
  constraint mission_assignments_mission_volunteer_key unique (mission_id, volunteer_id)
);

create index if not exists idx_mission_assignments_mission_id on public.mission_assignments(mission_id);
create index if not exists idx_mission_assignments_volunteer_id on public.mission_assignments(volunteer_id);

create or replace function public.can_manage_mission(_mission_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.missions m
    join public.profiles p on p.id = _user_id
    where m.id = _mission_id
      and (
        m.created_by = _user_id
        or p.role = 'admin'
      )
  );
$$;

create or replace function public.mission_status_is(_mission_id uuid, _status public.mission_status)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.missions m
    where m.id = _mission_id
      and m.status = _status
  );
$$;

create or replace function public.can_select_volunteer_for_mission(_mission_id uuid, _volunteer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mission_proposals mp
    where mp.mission_id = _mission_id
      and mp.volunteer_id = _volunteer_id
      and mp.response in ('available', 'maybe')
  );
$$;

revoke all on function public.can_manage_mission(uuid, uuid) from public;
revoke all on function public.mission_status_is(uuid, public.mission_status) from public;
revoke all on function public.can_select_volunteer_for_mission(uuid, uuid) from public;
grant execute on function public.can_manage_mission(uuid, uuid) to authenticated;
grant execute on function public.mission_status_is(uuid, public.mission_status) to authenticated;
grant execute on function public.can_select_volunteer_for_mission(uuid, uuid) to authenticated;

alter table public.mission_assignments enable row level security;

drop policy if exists "mission_assignments_select_strict" on public.mission_assignments;
create policy "mission_assignments_select_strict"
on public.mission_assignments
for select
using (
  public.current_user_role() = 'admin'
  or (
    public.current_user_role() = 'responsable'
    and public.is_mission_owner(mission_assignments.mission_id, auth.uid())
  )
  or (
    public.current_user_role() = 'benevole'
    and mission_assignments.volunteer_id = auth.uid()
  )
);

drop policy if exists "mission_assignments_insert_strict" on public.mission_assignments;
create policy "mission_assignments_insert_strict"
on public.mission_assignments
for insert
with check (
  public.can_manage_mission(mission_assignments.mission_id, auth.uid())
  and mission_assignments.assignment_status = 'selected'
  and public.can_select_volunteer_for_mission(mission_assignments.mission_id, mission_assignments.volunteer_id)
  and not public.mission_status_is(mission_assignments.mission_id, 'cancelled')
);

drop policy if exists "mission_assignments_update_strict" on public.mission_assignments;
create policy "mission_assignments_update_strict"
on public.mission_assignments
for update
using (
  public.can_manage_mission(mission_assignments.mission_id, auth.uid())
)
with check (
  public.can_manage_mission(mission_assignments.mission_id, auth.uid())
);

drop policy if exists "mission_assignments_delete_strict" on public.mission_assignments;
create policy "mission_assignments_delete_strict"
on public.mission_assignments
for delete
using (
  public.can_manage_mission(mission_assignments.mission_id, auth.uid())
  and not public.mission_status_is(mission_assignments.mission_id, 'cancelled')
);

-- Mission status update: only owner/admin can confirm/cancel/close.
drop policy if exists "missions_update_creator_admin" on public.missions;
create policy "missions_update_creator_admin"
on public.missions
for update
using (
  public.can_manage_mission(missions.id, auth.uid())
)
with check (
  public.can_manage_mission(missions.id, auth.uid())
);

-- Benevoles can respond only while mission is proposed.
drop policy if exists "mission_proposals_update_strict" on public.mission_proposals;
create policy "mission_proposals_update_strict"
on public.mission_proposals
for update
using (
  public.current_user_role() = 'admin'
  or (
    public.current_user_role() = 'responsable'
    and public.is_mission_owner(mission_proposals.mission_id, auth.uid())
  )
  or (
    public.current_user_role() = 'benevole'
    and mission_proposals.volunteer_id = auth.uid()
  )
)
with check (
  public.current_user_role() = 'admin'
  or (
    public.current_user_role() = 'responsable'
    and public.is_mission_owner(mission_proposals.mission_id, auth.uid())
  )
  or (
    public.current_user_role() = 'benevole'
    and mission_proposals.volunteer_id = auth.uid()
    and public.mission_status_is(mission_proposals.mission_id, 'proposed')
  )
);

drop policy if exists "mission_proposals_insert_strict" on public.mission_proposals;
create policy "mission_proposals_insert_strict"
on public.mission_proposals
for insert
with check (
  public.current_user_role() = 'admin'
  or (
    public.current_user_role() = 'responsable'
    and mission_proposals.proposed_by = auth.uid()
    and public.is_mission_owner(mission_proposals.mission_id, auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = mission_proposals.volunteer_id
        and p.role = 'benevole'
    )
  )
  or (
    public.current_user_role() = 'benevole'
    and mission_proposals.volunteer_id = auth.uid()
    and mission_proposals.proposed_by = auth.uid()
    and public.mission_status_is(mission_proposals.mission_id, 'proposed')
  )
);
