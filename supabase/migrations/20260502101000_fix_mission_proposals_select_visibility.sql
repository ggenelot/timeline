-- Fix volunteer visibility in mission proposals list:
-- volunteers should see all proposals for missions they can read,
-- while admins keep full access and responsables are limited to missions they own.

DROP POLICY IF EXISTS "mission_proposals_select_strict" ON public.mission_proposals;

CREATE POLICY "mission_proposals_select_strict"
ON public.mission_proposals
FOR SELECT
USING (
  public.current_user_role() = 'admin'
  OR (
    public.current_user_role() = 'responsable'
    AND public.is_mission_owner(mission_proposals.mission_id, auth.uid())
  )
  OR (
    public.current_user_role() = 'benevole'
    AND public.can_read_mission(mission_proposals.mission_id, auth.uid())
  )
);
