-- Table de règles de visibilité des missions, configurables par l'admin.
-- Chaque règle définit un groupe "privilégié" (par compétence ou aptitude).
-- Les bénévoles privilégiés voient toutes les missions.
-- Les autres bénévoles ne voient que les missions où un privilégié est disponible.

CREATE TABLE public.mission_visibility_rules (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text,
  -- 'skill' ou 'aptitude'
  criterion_type text     NOT NULL CHECK (criterion_type IN ('skill', 'aptitude')),
  -- uuid de la compétence ou de l'aptitude correspondante
  criterion_id   uuid    NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mission_visibility_rules ENABLE ROW LEVEL SECURITY;

-- Seul l'admin peut écrire
CREATE POLICY "admin_full_access_visibility_rules"
  ON public.mission_visibility_rules FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- Tous les utilisateurs authentifiés peuvent lire (nécessaire pour les fonctions RLS)
CREATE POLICY "authenticated_read_visibility_rules"
  ON public.mission_visibility_rules FOR SELECT
  TO authenticated
  USING (true);

-- ──────────────────────────────────────────────────────────────────────────────
-- Fonctions RLS dynamiques
-- ──────────────────────────────────────────────────────────────────────────────

-- Retourne true si l'utilisateur correspond à au moins une règle active.
CREATE OR REPLACE FUNCTION public.user_is_visibility_privileged(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mission_visibility_rules r
    WHERE r.is_active = true
      AND (
        (
          r.criterion_type = 'skill'
          AND EXISTS (
            SELECT 1 FROM public.profile_skills ps
            WHERE ps.profile_id = _user_id AND ps.skill_id = r.criterion_id
          )
        )
        OR
        (
          r.criterion_type = 'aptitude'
          AND EXISTS (
            SELECT 1 FROM public.profile_aptitudes pa
            WHERE pa.profile_id = _user_id AND pa.aptitude_id = r.criterion_id
          )
        )
      )
  );
$$;

-- Retourne true si la mission a au moins un bénévole disponible qui est privilégié.
CREATE OR REPLACE FUNCTION public.mission_has_privileged_available_volunteer(_mission_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mission_proposals mp
    WHERE mp.mission_id = _mission_id
      AND mp.response = 'available'
      AND public.user_is_visibility_privileged(mp.volunteer_id)
  );
$$;

-- Retourne true s'il existe au moins une règle de visibilité active.
CREATE OR REPLACE FUNCTION public.has_active_visibility_rules()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mission_visibility_rules WHERE is_active = true
  );
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- Mise à jour de can_read_mission avec les nouvelles règles dynamiques
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_read_mission(_mission_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.missions m
    WHERE m.id = _mission_id
      AND (
        -- Admins et responsables voient tout
        public.current_user_role() IN ('admin', 'responsable')

        -- Brouillon créé par le bénévole lui-même
        OR (m.status = 'draft' AND m.created_by = _user_id)

        -- Bénévoles sur missions non-brouillon
        OR (
          public.current_user_role() = 'benevole'
          AND m.status <> 'draft'
          AND (
            -- Règles actives : privilégiés voient tout, autres voient si un privilégié est dispo
            (
              public.has_active_visibility_rules()
              AND (
                public.user_is_visibility_privileged(_user_id)
                OR public.mission_has_privileged_available_volunteer(m.id)
              )
            )
            -- Aucune règle active : comportement par défaut (mission proposée au bénévole)
            OR (
              NOT public.has_active_visibility_rules()
              AND public.is_mission_proposed_to(m.id, _user_id)
            )
          )
        )
      )
  );
$$;

-- Grants
REVOKE ALL ON FUNCTION public.user_is_visibility_privileged(uuid) FROM public;
REVOKE ALL ON FUNCTION public.mission_has_privileged_available_volunteer(uuid) FROM public;
REVOKE ALL ON FUNCTION public.has_active_visibility_rules() FROM public;
REVOKE ALL ON FUNCTION public.can_read_mission(uuid, uuid) FROM public;

GRANT EXECUTE ON FUNCTION public.user_is_visibility_privileged(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mission_has_privileged_available_volunteer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_visibility_rules() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_mission(uuid, uuid) TO authenticated;

-- Recréer la policy missions SELECT pour utiliser la nouvelle can_read_mission
DROP POLICY IF EXISTS "missions_select_by_role" ON public.missions;
CREATE POLICY "missions_select_by_role"
  ON public.missions FOR SELECT
  USING (public.can_read_mission(missions.id, auth.uid()));
