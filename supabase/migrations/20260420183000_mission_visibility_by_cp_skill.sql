DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mission_category')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'mission_category'
        AND e.enumlabel = 'poste_de_secours'
    )
  THEN
    ALTER TYPE public.mission_category ADD VALUE 'poste_de_secours';
  END IF;
END
$$;

create or replace function public.user_has_cp_skill(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_skills ps
    join public.skills s on s.id = ps.skill_id
    where ps.profile_id = _user_id
      and lower(coalesce(s.name, '')) = 'cp'
  );
$$;

create or replace function public.mission_has_cp_available_volunteer(_mission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mission_proposals mp
    join public.profiles p on p.id = mp.volunteer_id
    where mp.mission_id = _mission_id
      and mp.response = 'available'
      and p.role = 'benevole'
      and public.user_has_cp_skill(mp.volunteer_id)
  );
$$;

create or replace function public.can_read_mission(_mission_id uuid, _user_id uuid)
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
      and (
        public.current_user_role() in ('admin', 'responsable')
        or (
          public.current_user_role() = 'benevole'
          and m.status <> 'draft'
          and (
            public.user_has_cp_skill(_user_id)
            or m.category::text <> 'poste_de_secours'
            or public.mission_has_cp_available_volunteer(m.id)
          )
        )
      )
  );
$$;

revoke all on function public.user_has_cp_skill(uuid) from public;
revoke all on function public.mission_has_cp_available_volunteer(uuid) from public;
revoke all on function public.can_read_mission(uuid, uuid) from public;

grant execute on function public.user_has_cp_skill(uuid) to authenticated;
grant execute on function public.mission_has_cp_available_volunteer(uuid) to authenticated;
grant execute on function public.can_read_mission(uuid, uuid) to authenticated;

drop policy if exists "missions_select_by_role" on public.missions;
create policy "missions_select_by_role"
on public.missions
for select
using (public.can_read_mission(missions.id, auth.uid()));
