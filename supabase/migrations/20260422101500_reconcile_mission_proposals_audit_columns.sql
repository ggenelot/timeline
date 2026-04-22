-- Reconcile mission_proposals audit/source columns to avoid PostgREST schema drift errors.
ALTER TABLE public.mission_proposals
  ADD COLUMN IF NOT EXISTS updated_by_admin boolean,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE public.mission_proposals
  ALTER COLUMN updated_by_admin SET DEFAULT false,
  ALTER COLUMN updated_at SET DEFAULT timezone('utc', now()),
  ALTER COLUMN source SET DEFAULT 'volunteer';

UPDATE public.mission_proposals
SET
  updated_by_admin = COALESCE(updated_by_admin, false),
  updated_at = COALESCE(updated_at, created_at),
  source = COALESCE(
    CASE
      WHEN source IN ('volunteer', 'admin') THEN source
      WHEN COALESCE(updated_by_admin, false) THEN 'admin'
      ELSE 'volunteer'
    END,
    'volunteer'
  )
WHERE updated_by_admin IS NULL
   OR updated_at IS NULL
   OR source IS NULL
   OR source NOT IN ('volunteer', 'admin');

ALTER TABLE public.mission_proposals
  ALTER COLUMN updated_by_admin SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN source SET NOT NULL,
  DROP CONSTRAINT IF EXISTS mission_proposals_source_check,
  ADD CONSTRAINT mission_proposals_source_check CHECK (source IN ('volunteer', 'admin'));

COMMENT ON COLUMN public.mission_proposals.source IS
  'Origin of the latest response update: volunteer self-response or admin override.';
