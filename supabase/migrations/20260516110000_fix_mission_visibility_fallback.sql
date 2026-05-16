-- Fix: when no required_for_visibility behavior covers a mission type,
-- missions should be visible to all volunteers (open access),
-- not restricted to explicitly proposed ones.
-- Previously the fallback was: no rule => only if proposed to user.
-- Correct semantic: no rule => visible to all non-draft missions.

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

        -- Bénévoles avec can_manage voient tout pour leur type de mission
        OR (
          public.current_user_role() = 'benevole'
          AND EXISTS (
            SELECT 1
            FROM public.profile_roles pr
            JOIN public.role_behaviors rb ON rb.role_id = pr.role_id
            WHERE pr.profile_id = _user_id
              AND rb.behavior_type = 'can_manage'
              AND (
                rb.mission_type_ids = '{}'
                OR m.mission_type_id = ANY(rb.mission_type_ids)
              )
          )
        )

        -- Brouillon créé par le bénévole lui-même
        OR (m.status = 'draft' AND m.created_by = _user_id)

        -- Bénévoles sur missions non-brouillon
        OR (
          public.current_user_role() = 'benevole'
          AND m.status <> 'draft'
          AND (
            -- Au moins un comportement required_for_visibility couvre ce type et accorde la visibilité
            EXISTS (
              SELECT 1
              FROM public.role_behaviors rb
              WHERE rb.behavior_type = 'required_for_visibility'
                AND (rb.mission_type_ids = '{}' OR m.mission_type_id = ANY(rb.mission_type_ids))
                AND (
                  EXISTS (
                    SELECT 1 FROM public.profile_roles pr
                    WHERE pr.profile_id = _user_id AND pr.role_id = rb.role_id
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM public.mission_proposals mp
                    JOIN public.profile_roles pr ON pr.profile_id = mp.volunteer_id
                    WHERE mp.mission_id = m.id
                      AND mp.response = 'available'
                      AND pr.role_id = rb.role_id
                  )
                )
            )
            -- Aucun comportement required_for_visibility ne couvre ce type :
            -- la mission est visible par tous les bénévoles (accès ouvert)
            OR NOT EXISTS (
              SELECT 1
              FROM public.role_behaviors rb
              WHERE rb.behavior_type = 'required_for_visibility'
                AND (rb.mission_type_ids = '{}' OR m.mission_type_id = ANY(rb.mission_type_ids))
            )
          )
        )
      )
  );
$$;
