DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mission_category') THEN
    CREATE TYPE public.mission_category AS ENUM ('maraude', 'garde', 'formation', 'vie_antenne');
  END IF;
END
$$;

ALTER TABLE public.missions
ADD COLUMN IF NOT EXISTS category public.mission_category;

UPDATE public.missions
SET category = 'maraude'
WHERE category IS NULL;

ALTER TABLE public.missions
ALTER COLUMN category SET DEFAULT 'maraude';

ALTER TABLE public.missions
ALTER COLUMN category SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_missions_category ON public.missions(category);
CREATE INDEX IF NOT EXISTS idx_missions_status_category ON public.missions(status, category);
