ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS slack_username text;
