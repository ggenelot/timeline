-- Connexion par code OTP 6 chiffres livré par Slack.
-- On étend slack_login_challenges (déjà utilisée par le magic-link slash-command) pour
-- distinguer les codes numériques courts et compter les tentatives (anti-bruteforce).

ALTER TABLE public.slack_login_challenges
  ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0,
  -- 'slash_magic' : long token du magic-link /timeline login (comportement historique, défaut
  -- pour préserver les lignes existantes). 'otp_login' : code 6 chiffres saisi sur /login.
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'slash_magic';

-- Lookup scopé au couple (team, user) pour la vérification d'un code court : évite tout
-- lookup global par hash (collisions / brute-force) et ne cible que les codes actifs.
CREATE INDEX IF NOT EXISTS idx_slack_login_challenges_active_scope
  ON public.slack_login_challenges(slack_team_id, slack_user_id, code_hash)
  WHERE consumed_at IS NULL;
