-- Système de parrainage : chaque bénévole peut avoir un parrain, qui est un
-- autre bénévole. Auto-référence sur profiles.
--   * ON DELETE SET NULL : supprimer un parrain ne supprime pas ses filleuls,
--     leur lien de parrainage est simplement effacé.
--   * CHECK : un bénévole ne peut pas être son propre parrain.
-- La contrainte « le parrain est un bénévole » est validée côté API
-- (routes /api/admin/volunteers), pas au niveau SQL, pour rester cohérent avec
-- les autres liaisons de profils (eope_user_id, etc.).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sponsor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_sponsor_not_self;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_sponsor_not_self CHECK (sponsor_id IS DISTINCT FROM id);

CREATE INDEX IF NOT EXISTS idx_profiles_sponsor_id
  ON public.profiles(sponsor_id)
  WHERE sponsor_id IS NOT NULL;
