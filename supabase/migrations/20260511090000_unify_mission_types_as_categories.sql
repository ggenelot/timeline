-- Replace hardcoded mission_category enum with mission_types as single source of truth.

-- ─── 1. Extend mission_types ────────────────────────────────────────────────
ALTER TABLE public.mission_types ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE public.mission_types DROP COLUMN IF EXISTS category;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'mission_types'
      AND policyname = 'Authenticated users can read mission types'
  ) THEN
    CREATE POLICY "Authenticated users can read mission types"
      ON public.mission_types FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ─── 2. Seed the five built-in types ────────────────────────────────────────
INSERT INTO public.mission_types (id, name, color, default_required_volunteers)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Maraude',          'violet', 1),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Garde',            'red',    1),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Formation',        'blue',   1),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'Vie de l''antenne','sky',    1),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'Poste de secours', 'orange', 1)
ON CONFLICT (id) DO NOTHING;

-- ─── 3. missions: replace category text column with mission_type_id FK ───────
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS mission_type_id uuid
  REFERENCES public.mission_types(id) ON DELETE SET NULL;

UPDATE public.missions
SET mission_type_id = CASE category
  WHEN 'maraude'         THEN 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
  WHEN 'garde'           THEN 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
  WHEN 'formation'       THEN 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  WHEN 'vie_antenne'     THEN 'aaaaaaaa-0000-0000-0000-000000000004'::uuid
  WHEN 'poste_de_secours'THEN 'aaaaaaaa-0000-0000-0000-000000000005'::uuid
  ELSE                        'aaaaaaaa-0000-0000-0000-000000000005'::uuid
END
WHERE mission_type_id IS NULL;

-- Drop the policy that references category BEFORE dropping the column
DROP POLICY IF EXISTS "benevoles_insert_draft_with_aptitude" ON public.missions;

ALTER TABLE public.missions ALTER COLUMN mission_type_id SET NOT NULL;
ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_category_check;
ALTER TABLE public.missions DROP COLUMN IF EXISTS category;

CREATE INDEX IF NOT EXISTS idx_missions_mission_type_id ON public.missions(mission_type_id);

-- ─── 4. aptitudes: replace allowed_categories text[] with uuid[] FK array ────
ALTER TABLE public.aptitudes
  ADD COLUMN IF NOT EXISTS allowed_mission_type_ids uuid[] NOT NULL DEFAULT '{}';

UPDATE public.aptitudes
SET allowed_mission_type_ids = ARRAY(
  SELECT mt.id FROM public.mission_types mt
  WHERE
    (mt.id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid AND 'maraude'          = ANY(allowed_categories))
    OR (mt.id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid AND 'garde'         = ANY(allowed_categories))
    OR (mt.id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid AND 'formation'     = ANY(allowed_categories))
    OR (mt.id = 'aaaaaaaa-0000-0000-0000-000000000004'::uuid AND 'vie_antenne'   = ANY(allowed_categories))
    OR (mt.id = 'aaaaaaaa-0000-0000-0000-000000000005'::uuid AND 'poste_de_secours' = ANY(allowed_categories))
);

ALTER TABLE public.aptitudes DROP COLUMN IF EXISTS allowed_categories;

-- ─── 5. New RLS policy using mission_type_id ─────────────────────────────────
CREATE POLICY "benevoles_insert_draft_with_aptitude"
  ON public.missions FOR INSERT
  WITH CHECK (
    status = 'draft'
    AND created_by = auth.uid()
    AND public.current_user_role() = 'benevole'
    AND EXISTS (
      SELECT 1
      FROM public.profile_aptitudes pa
      JOIN public.aptitudes a ON a.id = pa.aptitude_id
      WHERE pa.profile_id = auth.uid()
        AND mission_type_id = ANY(a.allowed_mission_type_ids)
    )
  );

-- ─── 6. mission_category_responsibilities: replace category with FK ───────────
ALTER TABLE public.mission_category_responsibilities
  ADD COLUMN IF NOT EXISTS mission_type_id uuid
  REFERENCES public.mission_types(id) ON DELETE CASCADE;

UPDATE public.mission_category_responsibilities
SET mission_type_id = CASE category
  WHEN 'maraude'         THEN 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
  WHEN 'garde'           THEN 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
  WHEN 'formation'       THEN 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  WHEN 'vie_antenne'     THEN 'aaaaaaaa-0000-0000-0000-000000000004'::uuid
  WHEN 'poste_de_secours'THEN 'aaaaaaaa-0000-0000-0000-000000000005'::uuid
END
WHERE mission_type_id IS NULL;

ALTER TABLE public.mission_category_responsibilities
  ALTER COLUMN mission_type_id SET NOT NULL;

ALTER TABLE public.mission_category_responsibilities
  DROP CONSTRAINT IF EXISTS "mission_category_responsibilitie_category_responsibility_id_key";
ALTER TABLE public.mission_category_responsibilities
  DROP CONSTRAINT IF EXISTS mission_category_responsibilities_category_check;
ALTER TABLE public.mission_category_responsibilities DROP COLUMN IF EXISTS category;

ALTER TABLE public.mission_category_responsibilities
  ADD CONSTRAINT mission_category_responsibilities_type_responsibility_key
  UNIQUE (mission_type_id, responsibility_id);
