-- Admin manual overrides for mission proposal responses + removal of legacy "maybe" response.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'mission_proposal_response'
      AND e.enumlabel = 'maybe'
  ) THEN
    ALTER TYPE public.mission_proposal_response RENAME TO mission_proposal_response_old;

    CREATE TYPE public.mission_proposal_response AS ENUM ('no_response', 'available', 'unavailable');

    ALTER TABLE public.mission_proposals
      ALTER COLUMN response TYPE public.mission_proposal_response
      USING (
        CASE
          WHEN response::text = 'maybe' THEN 'available'
          ELSE response::text
        END
      )::public.mission_proposal_response;

    DROP TYPE public.mission_proposal_response_old;
  END IF;
END
$$;

ALTER TABLE public.mission_proposals
  ADD COLUMN IF NOT EXISTS updated_by_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'volunteer',
  DROP CONSTRAINT IF EXISTS mission_proposals_source_check,
  ADD CONSTRAINT mission_proposals_source_check CHECK (source IN ('volunteer', 'admin'));

UPDATE public.mission_proposals
SET
  updated_by_admin = COALESCE(updated_by_admin, false),
  source = CASE WHEN COALESCE(updated_by_admin, false) THEN 'admin' ELSE 'volunteer' END,
  updated_at = COALESCE(updated_at, created_at)
WHERE source IS DISTINCT FROM CASE WHEN COALESCE(updated_by_admin, false) THEN 'admin' ELSE 'volunteer' END
   OR updated_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_mission_proposal_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_mission_proposal_updated_at() FROM public;
GRANT EXECUTE ON FUNCTION public.set_mission_proposal_updated_at() TO authenticated;

DROP TRIGGER IF EXISTS trg_set_mission_proposal_updated_at ON public.mission_proposals;
CREATE TRIGGER trg_set_mission_proposal_updated_at
BEFORE UPDATE ON public.mission_proposals
FOR EACH ROW EXECUTE FUNCTION public.set_mission_proposal_updated_at();

CREATE OR REPLACE FUNCTION public.can_select_volunteer_for_mission(_mission_id uuid, _volunteer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mission_proposals mp
    WHERE mp.mission_id = _mission_id
      AND mp.volunteer_id = _volunteer_id
      AND mp.response = 'available'
  );
$$;

REVOKE ALL ON FUNCTION public.can_select_volunteer_for_mission(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_select_volunteer_for_mission(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_proposal_response_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_label text;
BEGIN
  IF tg_op = 'UPDATE' AND new.response IS DISTINCT FROM old.response THEN
    actor_label := CASE WHEN COALESCE(new.updated_by_admin, false) THEN 'Admin' ELSE 'Bénévole' END;

    INSERT INTO public.activity_logs (mission_id, actor_id, action_type, entity_type, entity_id, description)
    VALUES (
      new.mission_id,
      auth.uid(),
      'proposal_response_updated',
      'mission_proposal',
      new.id,
      format('%s - réponse bénévole : %s → %s.', actor_label, old.response, new.response)
    );
  END IF;

  RETURN new;
END;
$$;
