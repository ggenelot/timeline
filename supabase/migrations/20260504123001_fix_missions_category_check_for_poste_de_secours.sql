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
      AND udt_name = 'mission_category'
  ) THEN
    ALTER TABLE public.missions
      ALTER COLUMN category TYPE text USING category::text;
  END IF;
END
$$;

UPDATE public.missions
SET category = 'poste_de_secours'
WHERE category IS NULL;

ALTER TABLE public.missions
  ALTER COLUMN category SET DEFAULT 'poste_de_secours';

ALTER TABLE public.missions
  ALTER COLUMN category SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'missions_category_check'
      AND conrelid = 'public.missions'::regclass
  ) THEN
    ALTER TABLE public.missions
      ADD CONSTRAINT missions_category_check
      CHECK (
        category IN (
          'maraude',
          'garde',
          'formation',
          'vie_antenne',
          'poste_de_secours'
        )
      );
  END IF;
END
$$;
