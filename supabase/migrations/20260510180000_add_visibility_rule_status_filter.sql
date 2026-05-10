-- Ajoute un filtre optionnel par statut aux règles de visibilité.
-- Quand required_status est NULL, la règle couvre tous les statuts non-brouillon (comportement actuel).
-- Quand required_status est défini, la règle ne s'applique qu'aux missions ayant ce statut.
--
-- Exemple de configuration :
--   - Règle "CP"  : criterion = compétence CP, required_status = 'proposed'
--     → Les CP voient toutes les missions proposées.
--     → Les non-CP voient les missions proposées où un CP est disponible.

ALTER TABLE public.mission_visibility_rules
  ADD COLUMN required_status text
    CHECK (required_status IN ('proposed', 'closed', 'confirmed', 'cancelled'));

-- ──────────────────────────────────────────────────────────────────────────────
-- Mise à jour de can_read_mission
-- La logique par règle remplace l'ancienne approche globale :
--   Pour chaque règle active dont le statut correspond (ou sans filtre),
--   un bénévole peut voir la mission s'il est dans le groupe OU
--   si un membre du groupe est disponible sur la mission.
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
            -- Au moins une règle active couvre ce statut et accorde la visibilité
            EXISTS (
              SELECT 1
              FROM public.mission_visibility_rules r
              WHERE r.is_active = true
                -- Filtre statut : la règle s'applique si pas de filtre ou si le statut correspond
                AND (r.required_status IS NULL OR m.status::text = r.required_status)
                AND (
                  -- L'utilisateur est dans le groupe privilégié de cette règle
                  (
                    r.criterion_type = 'skill'
                    AND EXISTS (
                      SELECT 1 FROM public.profile_skills ps
                      WHERE ps.profile_id = _user_id AND ps.skill_id = r.criterion_id
                    )
                  )
                  OR (
                    r.criterion_type = 'aptitude'
                    AND EXISTS (
                      SELECT 1 FROM public.profile_aptitudes pa
                      WHERE pa.profile_id = _user_id AND pa.aptitude_id = r.criterion_id
                    )
                  )
                  -- OU un membre du groupe privilégié est disponible sur cette mission
                  OR EXISTS (
                    SELECT 1
                    FROM public.mission_proposals mp
                    WHERE mp.mission_id = m.id
                      AND mp.response = 'available'
                      AND (
                        (
                          r.criterion_type = 'skill'
                          AND EXISTS (
                            SELECT 1 FROM public.profile_skills ps
                            WHERE ps.profile_id = mp.volunteer_id AND ps.skill_id = r.criterion_id
                          )
                        )
                        OR (
                          r.criterion_type = 'aptitude'
                          AND EXISTS (
                            SELECT 1 FROM public.profile_aptitudes pa
                            WHERE pa.profile_id = mp.volunteer_id AND pa.aptitude_id = r.criterion_id
                          )
                        )
                      )
                  )
                )
            )
            -- Aucune règle active : comportement par défaut (mission explicitement proposée)
            OR (
              NOT public.has_active_visibility_rules()
              AND public.is_mission_proposed_to(m.id, _user_id)
            )
          )
        )
      )
  );
$$;
