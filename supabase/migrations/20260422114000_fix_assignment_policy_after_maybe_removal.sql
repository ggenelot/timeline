-- Ensure assignment eligibility check stays compatible after removing legacy enum value 'maybe'.
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
      and mp.response = 'available'
  );
$$;

revoke all on function public.can_select_volunteer_for_mission(uuid, uuid) from public;
grant execute on function public.can_select_volunteer_for_mission(uuid, uuid) to authenticated;
