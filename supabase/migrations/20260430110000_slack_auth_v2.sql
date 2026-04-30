CREATE TABLE IF NOT EXISTS public.slack_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  slack_user_id text NOT NULL,
  slack_team_id text NOT NULL,
  slack_enterprise_id text,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  last_login_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_slack_identities_team_user_unique
  ON public.slack_identities(slack_team_id, slack_user_id);

CREATE INDEX IF NOT EXISTS idx_slack_identities_profile_id
  ON public.slack_identities(profile_id);

CREATE TABLE IF NOT EXISTS public.slack_login_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_team_id text NOT NULL,
  slack_user_id text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  requested_ip text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_slack_login_challenges_lookup
  ON public.slack_login_challenges(slack_team_id, slack_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_slack_login_challenges_hash
  ON public.slack_login_challenges(code_hash);

ALTER TABLE public.slack_oauth_states
  ADD COLUMN IF NOT EXISTS intent text NOT NULL DEFAULT 'connect';

INSERT INTO public.slack_identities (profile_id, slack_user_id, slack_team_id, is_primary, created_at, updated_at)
SELECT p.id, p.slack_user_id, p.slack_team_id, true, timezone('utc'::text, now()), timezone('utc'::text, now())
FROM public.profiles p
LEFT JOIN public.slack_identities i
  ON i.slack_team_id = p.slack_team_id
 AND i.slack_user_id = p.slack_user_id
WHERE p.slack_user_id IS NOT NULL
  AND p.slack_team_id IS NOT NULL
  AND i.id IS NULL;

ALTER TABLE public.slack_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_login_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "slack_identities_no_client_access" ON public.slack_identities;
CREATE POLICY "slack_identities_no_client_access" ON public.slack_identities FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "slack_login_challenges_no_client_access" ON public.slack_login_challenges;
CREATE POLICY "slack_login_challenges_no_client_access" ON public.slack_login_challenges FOR ALL TO authenticated USING (false) WITH CHECK (false);
