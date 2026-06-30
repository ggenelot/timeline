-- Unify mission types as categories: replace missions.category (enum) with
-- missions.mission_type_id (uuid FK to mission_types). Also migrate
-- aptitudes.allowed_categories and mission_category_responsibilities.category.
--
-- These 5 built-in types use deterministic UUIDs so application code can
-- hardcode them as constants.

-- ── 1. Seed the 5 built-in mission types ─────────────────────────────────────

INSERT INTO public.mission_types (id, name, description)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Maraude',           NULL),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Garde',             NULL),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Formation',         NULL),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'Vie de l''antenne', NULL),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'Poste de secours',  NULL)
ON CONFLICT (id) DO NOTHING;

-- ── 2. missions: add mission_type_id, backfill, drop category ────────────────
-- Cette section duplique le travail déjà fait par 20260511090000 (qui s'applique
-- avant celle-ci) : sur tout historique de migration appliqué depuis le début,
-- missions.category n'existe donc déjà plus ici. Gardée derrière un test
-- d'existence pour rester un no-op sûr dans ce cas, et continuer à fonctionner
-- telle quelle sur un environnement où, par dérive, elle s'appliquerait seule.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'missions' AND column_name = 'category'
  ) THEN
    ALTER TABLE public.missions
      ADD COLUMN IF NOT EXISTS mission_type_id uuid REFERENCES public.mission_types(id);

    UPDATE public.missions
    SET mission_type_id = CASE category::text
      WHEN 'maraude'          THEN 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
      WHEN 'garde'            THEN 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
      WHEN 'formation'        THEN 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
      WHEN 'vie_antenne'      THEN 'aaaaaaaa-0000-0000-0000-000000000004'::uuid
      WHEN 'poste_de_secours' THEN 'aaaaaaaa-0000-0000-0000-000000000005'::uuid
      ELSE                         'aaaaaaaa-0000-0000-0000-000000000001'::uuid
    END;

    ALTER TABLE public.missions
      ALTER COLUMN mission_type_id SET NOT NULL;

    DROP INDEX IF EXISTS idx_missions_category;
    DROP INDEX IF EXISTS idx_missions_status_category;

    ALTER TABLE public.missions
      DROP COLUMN category;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_missions_mission_type_id ON public.missions(mission_type_id);
CREATE INDEX IF NOT EXISTS idx_missions_status_mission_type_id ON public.missions(status, mission_type_id);

-- ── 3. aptitudes: add allowed_mission_type_ids, backfill, drop allowed_categories
-- Même remarque : déjà fait par 20260511090000 sur un historique appliqué en entier.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'aptitudes' AND column_name = 'allowed_categories'
  ) THEN
    ALTER TABLE public.aptitudes
      ADD COLUMN IF NOT EXISTS allowed_mission_type_ids uuid[] NOT NULL DEFAULT '{}';

    UPDATE public.aptitudes
    SET allowed_mission_type_ids = (
      SELECT array_agg(
        CASE cat
          WHEN 'maraude'          THEN 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
          WHEN 'garde'            THEN 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
          WHEN 'formation'        THEN 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
          WHEN 'vie_antenne'      THEN 'aaaaaaaa-0000-0000-0000-000000000004'::uuid
          WHEN 'poste_de_secours' THEN 'aaaaaaaa-0000-0000-0000-000000000005'::uuid
        END
      )
      FROM unnest(allowed_categories) AS cat
    )
    WHERE array_length(allowed_categories, 1) > 0;

    ALTER TABLE public.aptitudes
      DROP COLUMN IF EXISTS allowed_categories;
  END IF;
END
$$;

-- ── 4. mission_category_responsibilities: replace category with mission_type_id
-- Même remarque : déjà fait par 20260511090000 sur un historique appliqué en entier.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mission_category_responsibilities' AND column_name = 'category'
  ) THEN
    ALTER TABLE public.mission_category_responsibilities
      ADD COLUMN IF NOT EXISTS mission_type_id uuid REFERENCES public.mission_types(id);

    UPDATE public.mission_category_responsibilities
    SET mission_type_id = CASE category
      WHEN 'maraude'          THEN 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
      WHEN 'garde'            THEN 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
      WHEN 'formation'        THEN 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
      WHEN 'vie_antenne'      THEN 'aaaaaaaa-0000-0000-0000-000000000004'::uuid
      WHEN 'poste_de_secours' THEN 'aaaaaaaa-0000-0000-0000-000000000005'::uuid
    END;

    ALTER TABLE public.mission_category_responsibilities
      ALTER COLUMN mission_type_id SET NOT NULL;

    -- Drop old unique constraint and add new one on mission_type_id
    ALTER TABLE public.mission_category_responsibilities
      DROP CONSTRAINT IF EXISTS mission_category_responsibilities_category_responsibility_id_key;

    ALTER TABLE public.mission_category_responsibilities
      ADD CONSTRAINT mission_category_responsibilities_mission_type_id_responsibility_key
      UNIQUE (mission_type_id, responsibility_id);

    ALTER TABLE public.mission_category_responsibilities
      DROP COLUMN category;
  END IF;
END
$$;

-- ── 5. Update benevoles_insert_draft_with_aptitude policy to use mission_type_id

DROP POLICY IF EXISTS "benevoles_insert_draft_with_aptitude" ON public.missions;

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
        AND missions.mission_type_id = ANY(a.allowed_mission_type_ids)
    )
  );
