-- Ajoute un filtre optionnel par catégorie de mission aux règles de visibilité.
-- Quand required_category est NULL, la règle couvre toutes les catégories.
-- Quand required_category est défini, la règle ne s'applique qu'aux missions de cette catégorie.
--
-- Exemple de configuration pour "Postes de secours" :
--   - Règle "Visibilité CP - PS"  : criterion = compétence CP,
--                                   required_status = 'proposed',
--                                   required_category = 'poste_de_secours'
--     → Les CP voient tous les postes de secours proposés.
--     → Les non-CP voient les postes de secours proposés où un CP est disponible.
--     → Les brouillons restent invisibles (gérés par la condition draft existante).

ALTER TABLE public.mission_visibility_rules
  ADD COLUMN required_category text
    CHECK (required_category IN ('maraude', 'garde', 'formation', 'vie_antenne', 'poste_de_secours'));

-- ──────────────────────────────────────────────────────────────────────────────
-- Mise à jour de can_read_mission avec filtre statut + catégorie par règle
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
            -- Au moins une règle active couvre ce statut/catégorie et accorde la visibilité
            EXISTS (
              SELECT 1
              FROM public.mission_visibility_rules r
              WHERE r.is_active = true
                -- Filtre statut : la règle s'applique si pas de filtre ou si le statut correspond
                AND (r.required_status IS NULL OR m.status::text = r.required_status)
                -- Filtre catégorie : la règle s'applique si pas de filtre ou si la catégorie correspond
                -- (missions.category a déjà été remplacée par mission_type_id par
                -- 20260511090000_unify_mission_types_as_categories.sql, qui s'applique avant
                -- cette migration ; on retrouve donc la catégorie via ce mapping figé.)
                AND (r.required_category IS NULL OR m.mission_type_id = CASE r.required_category
                      WHEN 'maraude'          THEN 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
                      WHEN 'garde'            THEN 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
                      WHEN 'formation'        THEN 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
                      WHEN 'vie_antenne'      THEN 'aaaaaaaa-0000-0000-0000-000000000004'::uuid
                      WHEN 'poste_de_secours' THEN 'aaaaaaaa-0000-0000-0000-000000000005'::uuid
                    END)
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
