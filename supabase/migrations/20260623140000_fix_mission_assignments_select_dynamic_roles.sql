-- mission_assignments_select_strict was never migrated to the dynamic roles
-- system: it still gates manager access on profiles.role = 'responsable',
-- while every other policy on this table (insert/update/delete) already uses
-- can_manage_mission(), which also accepts the dynamic can_manage role
-- behavior. A mission manager who only has the dynamic right (no legacy
-- 'responsable' enum value) can therefore create/update assignments but
-- cannot read them back, which empties the crew list and the activity chart
-- on the mission detail page (get_candidate_activity joins mission_assignments
-- and runs security invoker, so it inherits this gap).

drop policy if exists "mission_assignments_select_strict" on public.mission_assignments;
create policy "mission_assignments_select_strict"
on public.mission_assignments
for select
using (
  public.can_manage_mission(mission_assignments.mission_id, auth.uid())
  or mission_assignments.volunteer_id = auth.uid()
);
