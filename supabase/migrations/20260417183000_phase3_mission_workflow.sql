DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mission_proposal_status') THEN
    CREATE TYPE public.mission_proposal_status AS ENUM ('pending', 'accepted', 'refused');
  END IF;
END
$$;

ALTER TABLE public.mission_proposals
  ADD COLUMN IF NOT EXISTS status public.mission_proposal_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mission_proposals_status ON public.mission_proposals(status);

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
    AND mission_proposals.volunteer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "mission_proposals_insert_strict" ON public.mission_proposals;
CREATE POLICY "mission_proposals_insert_strict"
ON public.mission_proposals
FOR INSERT
WITH CHECK (
  public.current_user_role() = 'admin'
  OR (
    public.current_user_role() = 'responsable'
    AND mission_proposals.proposed_by = auth.uid()
    AND public.is_mission_owner(mission_proposals.mission_id, auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = mission_proposals.volunteer_id
        AND p.role = 'benevole'
    )
  )
  OR (
    public.current_user_role() = 'benevole'
    AND mission_proposals.volunteer_id = auth.uid()
    AND mission_proposals.proposed_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "mission_proposals_update_strict" ON public.mission_proposals;
CREATE POLICY "mission_proposals_update_strict"
ON public.mission_proposals
FOR UPDATE
USING (
  public.current_user_role() = 'admin'
  OR (
    public.current_user_role() = 'responsable'
    AND public.is_mission_owner(mission_proposals.mission_id, auth.uid())
  )
)
WITH CHECK (
  public.current_user_role() = 'admin'
  OR (
    public.current_user_role() = 'responsable'
    AND public.is_mission_owner(mission_proposals.mission_id, auth.uid())
  )
);
