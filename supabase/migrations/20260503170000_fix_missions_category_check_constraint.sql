DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'missions'
      AND constraint_name = 'missions_category_check'
  ) THEN
    ALTER TABLE public.missions DROP CONSTRAINT missions_category_check;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'missions'
      AND column_name = 'category'
      AND udt_name <> 'mission_category'
  ) THEN
    ALTER TABLE public.missions
      ADD CONSTRAINT missions_category_check
      CHECK (lower(category::text) IN ('maraude', 'garde', 'formation', 'vie_antenne', 'poste_de_secours'));
  END IF;
END
$$;
