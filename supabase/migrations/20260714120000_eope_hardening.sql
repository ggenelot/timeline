-- Durcissement de l'intégration eOPE (revue de code) :
--   1. eope_commitment_links mémorise aussi l'identité distante poussée
--      (eope_user_id), pour détecter un changement de liaison (bénévole relié
--      à un autre compte eOPE, mission reliée à un autre événement) et
--      recréer l'engagement au lieu de le croire inchangé.
--   2. Un seul run de synchronisation « running » à la fois : l'unicité est
--      garantie par index (claim atomique), plus seulement par une lecture
--      préalable susceptible de courses entre cron et déclenchement manuel.
--   3. profiles.eope_user_id est une liaison décidée par les gestionnaires :
--      la policy RLS profiles_update_own permettrait à un bénévole de se lier
--      lui-même à n'importe quel compte eOPE — un trigger garde-fou l'empêche
--      (les routes d'administration passent en service role, auth.uid() nul).

ALTER TABLE public.eope_commitment_links
  ADD COLUMN IF NOT EXISTS eope_user_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_eope_sync_runs_single_running
  ON public.eope_sync_runs ((status))
  WHERE status = 'running';

CREATE OR REPLACE FUNCTION public.guard_profiles_eope_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.eope_user_id IS DISTINCT FROM OLD.eope_user_id
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Seul un administrateur peut modifier la liaison eOPE d''un profil.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles_eope_user_id ON public.profiles;
CREATE TRIGGER trg_guard_profiles_eope_user_id
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profiles_eope_user_id();
