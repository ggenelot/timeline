-- Réglages des intégrations externes (eOPE aujourd'hui, d'autres outils
-- demain), configurables depuis l'UI (/admin/integrations) plutôt que par
-- variables d'environnement.
--
-- La colonne settings contient la configuration du fournisseur, Y COMPRIS ses
-- secrets (client_secret…). La table est donc totalement inaccessible côté
-- client (deny-all, même en lecture) : toutes les lectures/écritures passent
-- par les routes API en service role, qui ne renvoient jamais les secrets
-- (seulement un indicateur « défini »).

CREATE TABLE IF NOT EXISTS public.integration_settings (
  provider text PRIMARY KEY,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integration_settings_no_client_access" ON public.integration_settings;
CREATE POLICY "integration_settings_no_client_access"
ON public.integration_settings
FOR ALL
USING (false)
WITH CHECK (false);
