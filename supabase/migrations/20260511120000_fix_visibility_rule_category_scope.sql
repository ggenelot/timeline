-- Bug fix: the fallback "no active rules → show mission if proposed to user" was
-- using has_active_visibility_rules() (global check) instead of checking whether
-- any active rule actually *covers* the current mission (by status and category).
--
-- Consequence: when a rule scoped to a specific category (e.g. poste_de_secours)
-- is active, has_active_visibility_rules() returns true, so the fallback never
-- fires for missions in other categories (e.g. maraudes), making them invisible
-- to all volunteers even when they were explicitly proposed to them.
--
-- Fix: replace NOT has_active_visibility_rules() with NOT EXISTS (rule covering
-- this specific mission), so only missions *governed* by a rule use privileged
-- visibility logic; all other missions fall back to the default proposal check.

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
            -- Au moins une règle active couvre ce statut/catégorie et accorde la visibilité
            EXISTS (
              SELECT 1
              FROM public.mission_visibility_rules r
              WHERE r.is_active = true
                AND (r.required_status IS NULL OR m.status::text = r.required_status)
                AND (r.required_category IS NULL OR m.category::text = r.required_category)
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
            -- Aucune règle active ne couvre cette mission : comportement par défaut
            OR (
              NOT EXISTS (
                SELECT 1
                FROM public.mission_visibility_rules r
                WHERE r.is_active = true
                  AND (r.required_status IS NULL OR m.status::text = r.required_status)
                  AND (r.required_category IS NULL OR m.category::text = r.required_category)
              )
              AND public.is_mission_proposed_to(m.id, _user_id)
            )
          )
        )
      )
  );
$$;
