-- Fix: admins and responsables should not be blocked by mission_allows_response()
-- when updating proposals. Only volunteers are restricted to 'proposed' missions.
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
    and public.mission_allows_response(mission_proposals.mission_id)
  )
);
