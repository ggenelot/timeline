-- Revert INSERT and UPDATE policies to original: mission_allows_response() applies to all roles.
-- The clear error message is now handled at the API layer instead.

drop policy if exists "mission_proposals_insert_strict" on public.mission_proposals;

create policy "mission_proposals_insert_strict"
on public.mission_proposals
for insert
with check (
  public.mission_allows_response(mission_proposals.mission_id)
  and (
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
    and mission_proposals.volunteer_id = auth.uid()
  )
)
with check (
  public.mission_allows_response(mission_proposals.mission_id)
  and (
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
);
