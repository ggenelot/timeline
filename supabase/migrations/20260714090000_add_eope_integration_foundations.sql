-- Intégration eOPE (application départementale de gestion des disponibilités).
-- Fondations de la synchronisation bidirectionnelle :
--   * pull : événements eOPE -> missions (lien missions.eope_event_id)
--   * push : équipages engagés -> engagements validés eOPE (eope_commitment_links)
-- NB : « eOPE » est le système externe départemental, sans rapport avec le
-- tableau de bord interne « OPE » (/admin/ope-dashboard).

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS eope_event_id text,
  ADD COLUMN IF NOT EXISTS eope_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS eope_payload jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_missions_eope_event_id_unique
  ON public.missions(eope_event_id)
  WHERE eope_event_id IS NOT NULL;

-- Correspondance manuelle bénévole Timeline <-> utilisateur eOPE (saisie admin).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS eope_user_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_eope_user_id_unique
  ON public.profiles(eope_user_id)
  WHERE eope_user_id IS NOT NULL;

-- Journal des exécutions de synchronisation (affiché sur /admin/eope).
CREATE TABLE IF NOT EXISTS public.eope_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('pull', 'push', 'full')),
  trigger_source text NOT NULL CHECK (trigger_source IN ('manual', 'cron')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'error')),
  triggered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  finished_at timestamptz,
  -- {events_seen, missions_created, missions_updated, missions_cancelled,
  --  commitments_created, commitments_deleted, conflicts:[...], skipped_unlinked:[...]}
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- [{scope:'pull'|'push', item_ref, message}]
  errors jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_eope_sync_runs_started_at
  ON public.eope_sync_runs(started_at DESC);

-- État distant enregistré : quel engagement eOPE a été poussé pour quel couple
-- (mission, bénévole). Clé sur mission+bénévole (pas assignment_id) pour que le
-- diff du push puisse émettre les DELETE même après remplacement/suppression de
-- l'affectation. La suppression en cascade d'une mission/d'un profil peut
-- laisser un engagement orphelin côté eOPE (cas rare, documenté docs/eope-api.md).
CREATE TABLE IF NOT EXISTS public.eope_commitment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  volunteer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  eope_commitment_id text NOT NULL,
  eope_event_id text NOT NULL,
  pushed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  last_synced_at timestamptz,
  UNIQUE (mission_id, volunteer_id)
);

CREATE INDEX IF NOT EXISTS idx_eope_commitment_links_mission
  ON public.eope_commitment_links(mission_id);

ALTER TABLE public.eope_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eope_commitment_links ENABLE ROW LEVEL SECURITY;

-- Lecture réservée aux admins ; toutes les écritures passent par le service
-- role dans les routes API (deny-all côté client).
DROP POLICY IF EXISTS "eope_sync_runs_select_admin" ON public.eope_sync_runs;
CREATE POLICY "eope_sync_runs_select_admin"
ON public.eope_sync_runs
FOR SELECT
USING ((SELECT public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "eope_sync_runs_no_client_writes" ON public.eope_sync_runs;
CREATE POLICY "eope_sync_runs_no_client_writes"
ON public.eope_sync_runs
FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS "eope_sync_runs_no_client_updates" ON public.eope_sync_runs;
CREATE POLICY "eope_sync_runs_no_client_updates"
ON public.eope_sync_runs
FOR UPDATE
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "eope_sync_runs_no_client_deletes" ON public.eope_sync_runs;
CREATE POLICY "eope_sync_runs_no_client_deletes"
ON public.eope_sync_runs
FOR DELETE
USING (false);

DROP POLICY IF EXISTS "eope_commitment_links_select_admin" ON public.eope_commitment_links;
CREATE POLICY "eope_commitment_links_select_admin"
ON public.eope_commitment_links
FOR SELECT
USING ((SELECT public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "eope_commitment_links_no_client_writes" ON public.eope_commitment_links;
CREATE POLICY "eope_commitment_links_no_client_writes"
ON public.eope_commitment_links
FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS "eope_commitment_links_no_client_updates" ON public.eope_commitment_links;
CREATE POLICY "eope_commitment_links_no_client_updates"
ON public.eope_commitment_links
FOR UPDATE
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "eope_commitment_links_no_client_deletes" ON public.eope_commitment_links;
CREATE POLICY "eope_commitment_links_no_client_deletes"
ON public.eope_commitment_links
FOR DELETE
USING (false);
