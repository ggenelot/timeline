-- Fix circular RLS dependency between missions and mission_proposals.
-- We move cross-table checks into SECURITY DEFINER helper functions.

create or replace function public.is_mission_owner(_mission_id uuid, _user_id uuid)
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
      and m.created_by = _user_id
  );
$$;

create or replace function public.is_mission_proposed_to(_mission_id uuid, _volunteer_id uuid)
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
  );
$$;

revoke all on function public.is_mission_owner(uuid, uuid) from public;
revoke all on function public.is_mission_proposed_to(uuid, uuid) from public;
grant execute on function public.is_mission_owner(uuid, uuid) to authenticated;
grant execute on function public.is_mission_proposed_to(uuid, uuid) to authenticated;

drop policy if exists "missions_select_by_role" on public.missions;
create policy "missions_select_by_role"
on public.missions
for select
using (
  public.current_user_role() in ('admin', 'responsable')
  or (
    public.current_user_role() = 'benevole'
    and public.is_mission_proposed_to(missions.id, auth.uid())
  )
);

drop policy if exists "mission_proposals_select_strict" on public.mission_proposals;
create policy "mission_proposals_select_strict"
on public.mission_proposals
for select
using (
  public.current_user_role() = 'admin'
  or (
    public.current_user_role() = 'responsable'
    and public.is_mission_owner(mission_proposals.mission_id, auth.uid())
  )
  or (
    public.current_user_role() = 'benevole'
    and volunteer_id = auth.uid()
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
    and proposed_by = auth.uid()
    and public.is_mission_owner(mission_proposals.mission_id, auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = mission_proposals.volunteer_id
        and p.role = 'benevole'
    )
  )
);

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
    and volunteer_id = auth.uid()
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
    and volunteer_id = auth.uid()
  )
);
