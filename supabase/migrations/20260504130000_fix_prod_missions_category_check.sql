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

UPDATE public.missions
SET category = 'poste_de_secours'
WHERE category IS NULL;

ALTER TABLE public.missions
  ALTER COLUMN category SET DEFAULT 'poste_de_secours';

ALTER TABLE public.missions
  ALTER COLUMN category SET NOT NULL;

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
