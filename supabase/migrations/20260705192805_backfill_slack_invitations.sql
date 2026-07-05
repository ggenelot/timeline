-- Backfill : la migration 20260505113000_add_slack_invitations avait été marquée comme
-- appliquée dans l'historique sans jamais créer réellement la table en production
-- (constaté via un schema cache PostgREST manquant). Cette migration réapplique le DDL
-- d'origine directement en production le 2026-07-05 ; ce fichier réconcilie l'historique
-- des migrations locales avec ce qui existe désormais côté serveur.
CREATE TABLE IF NOT EXISTS public.slack_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_user_id text NOT NULL,
  slack_team_id text NOT NULL,
  slack_email text,
  slack_name text,
  matched_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  invite_token text NOT NULL UNIQUE,
  invite_url text,
  sent_at timestamptz,
  accepted_at timestamptz,
  error_message text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT slack_invitations_status_check CHECK (status IN ('pending','sent','accepted','expired','error','skipped')),
  CONSTRAINT slack_invitations_team_user_unique UNIQUE (slack_team_id, slack_user_id)
);

CREATE INDEX IF NOT EXISTS idx_slack_invitations_status ON public.slack_invitations(status);
CREATE INDEX IF NOT EXISTS idx_slack_invitations_matched_profile_id ON public.slack_invitations(matched_profile_id);

CREATE OR REPLACE FUNCTION public.tg_set_timestamp_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_slack_invitations_updated_at ON public.slack_invitations;
CREATE TRIGGER set_slack_invitations_updated_at
BEFORE UPDATE ON public.slack_invitations
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_timestamp_updated_at();

ALTER TABLE public.slack_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "slack_invitations_admin_only" ON public.slack_invitations;
CREATE POLICY "slack_invitations_admin_only"
ON public.slack_invitations
FOR ALL TO authenticated
USING (public.current_user_role() = 'admin')
WITH CHECK (public.current_user_role() = 'admin');
