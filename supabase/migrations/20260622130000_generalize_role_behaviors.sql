-- Generalize role_behaviors beyond missions: add a resource_type ("domain")
-- so the dynamic roles system (roles / profile_roles / role_behaviors) can
-- grant rights on any resource, not just missions. Cursus is the first new
-- domain; mission_type_ids/mission_statuses remain mission-only columns and
-- stay unused (empty) on non-mission rows.

create type public.role_behavior_resource_type as enum ('mission', 'cursus');

alter table public.role_behaviors
  add column resource_type public.role_behavior_resource_type not null default 'mission';

-- Cursus only supports can_manage today (no per-status/per-type visibility
-- concepts like missions have); enforce this at the DB level.
alter table public.role_behaviors
  add constraint role_behaviors_cursus_behavior_check
  check (resource_type <> 'cursus' or behavior_type = 'can_manage');

-- Generic permission-check helper, reusable for any current/future domain.
create or replace function public.has_role_behavior(
  _user_id uuid,
  _resource_type public.role_behavior_resource_type,
  _behavior public.role_behavior_type
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_roles pr
    join public.role_behaviors rb on rb.role_id = pr.role_id
    where pr.profile_id = _user_id
      and rb.resource_type = _resource_type
      and rb.behavior_type = _behavior
  );
$$;

revoke all on function public.has_role_behavior(uuid, public.role_behavior_resource_type, public.role_behavior_type) from public;
grant execute on function public.has_role_behavior(uuid, public.role_behavior_resource_type, public.role_behavior_type) to authenticated;
