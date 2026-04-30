ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS slack_user_id text,
  ADD COLUMN IF NOT EXISTS slack_team_id text,
  ADD COLUMN IF NOT EXISTS slack_connected_at timestamptz;

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS slack_channel_id text,
  ADD COLUMN IF NOT EXISTS slack_channel_name text,
  ADD COLUMN IF NOT EXISTS slack_channel_created_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_slack_team_user_unique
  ON public.profiles(slack_team_id, slack_user_id)
  WHERE slack_team_id IS NOT NULL AND slack_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.slack_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL UNIQUE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_slack_oauth_states_profile_id
  ON public.slack_oauth_states(profile_id);

CREATE INDEX IF NOT EXISTS idx_slack_oauth_states_expires_at
  ON public.slack_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS public.slack_notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  mission_id uuid REFERENCES public.missions(id) ON DELETE CASCADE,
  type text NOT NULL,
  status text NOT NULL,
  error_message text,
  sent_at timestamptz,
  dedupe_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT slack_notification_logs_type_check CHECK (
    type IN (
      'volunteer_rejected_dm',
      'mission_channel_created',
      'mission_channel_welcome',
      'mission_channel_invite'
    )
  ),
  CONSTRAINT slack_notification_logs_status_check CHECK (status IN ('sent', 'skipped', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_slack_notification_logs_profile_mission
  ON public.slack_notification_logs(profile_id, mission_id, type);

ALTER TABLE public.slack_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "slack_oauth_states_no_client_access" ON public.slack_oauth_states;
CREATE POLICY "slack_oauth_states_no_client_access"
ON public.slack_oauth_states
FOR ALL
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "slack_notification_logs_select_admin_only" ON public.slack_notification_logs;
CREATE POLICY "slack_notification_logs_select_admin_only"
ON public.slack_notification_logs
FOR SELECT
USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "slack_notification_logs_no_client_writes" ON public.slack_notification_logs;
CREATE POLICY "slack_notification_logs_no_client_writes"
ON public.slack_notification_logs
FOR ALL
USING (false)
WITH CHECK (false);
