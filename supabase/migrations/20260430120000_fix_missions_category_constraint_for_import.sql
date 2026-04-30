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
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mission_category') THEN
    CREATE TYPE public.mission_category AS ENUM ('maraude', 'garde', 'formation', 'vie_antenne', 'poste_de_secours');
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
      ALTER COLUMN category TYPE public.mission_category
      USING (
        CASE
          WHEN category IS NULL THEN 'poste_de_secours'::public.mission_category
          WHEN lower(category::text) IN ('maraude', 'garde', 'formation', 'vie_antenne', 'poste_de_secours') THEN lower(category::text)::public.mission_category
          WHEN lower(category::text) LIKE '%dps%' OR lower(category::text) LIKE '%poste%' THEN 'poste_de_secours'::public.mission_category
          WHEN lower(category::text) LIKE '%garde%' THEN 'garde'::public.mission_category
          WHEN lower(category::text) LIKE '%format%' THEN 'formation'::public.mission_category
          WHEN lower(category::text) LIKE '%antenne%' OR lower(category::text) LIKE '%vie%' THEN 'vie_antenne'::public.mission_category
          ELSE 'poste_de_secours'::public.mission_category
        END
      );
  END IF;
END
$$;

ALTER TABLE public.missions
  ALTER COLUMN category SET DEFAULT 'poste_de_secours';

UPDATE public.missions
SET category = 'poste_de_secours'
WHERE category IS NULL;

ALTER TABLE public.missions
  ALTER COLUMN category SET NOT NULL;
