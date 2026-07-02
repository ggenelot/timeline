-- Bug: mission_proposals_insert_strict / mission_proposals_update_strict required
-- mission_allows_response(mission_id) (mission.status = 'proposed') for every role,
-- including admin. The admin "add/override volunteer status" endpoint
-- (PUT /api/admin/missions/[missionId]/volunteers) has no such restriction client-side,
-- so admins hit "Action refusée par la politique RLS." on any mission not already
-- in 'proposed' status (draft, confirmed, closed, cancelled) — the vast majority of
-- production missions. Admins have full access per business rules, so they should
-- bypass this status gate; responsable/bénévole paths keep the existing restriction.

drop policy if exists "mission_proposals_insert_strict" on public.mission_proposals;
create policy "mission_proposals_insert_strict"
on public.mission_proposals
for insert
with check (
  public.current_user_role() = 'admin'
  or (
    public.mission_allows_response(mission_proposals.mission_id)
    and (
      (
        public.has_role_behavior(auth.uid(), 'mission', 'can_manage')
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
      )
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
    public.has_role_behavior(auth.uid(), 'mission', 'can_manage')
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
    public.mission_allows_response(mission_proposals.mission_id)
    and (
      (
        public.has_role_behavior(auth.uid(), 'mission', 'can_manage')
        and public.is_mission_owner(mission_proposals.mission_id, auth.uid())
      )
      or (
        public.current_user_role() = 'benevole'
        and mission_proposals.volunteer_id = auth.uid()
      )
    )
  )
);
