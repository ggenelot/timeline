-- Creates the unified roles system, replacing aptitudes/responsibilities/visibility rules

-- 1. roles table
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. profile_roles many-to-many
CREATE TABLE public.profile_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, role_id)
);

-- 3. role_behavior_type enum + role_behaviors table
CREATE TYPE public.role_behavior_type AS ENUM (
  'can_create',
  'can_manage',
  'required_for_visibility',
  'auto_slack'
);

CREATE TABLE public.role_behaviors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  behavior_type public.role_behavior_type NOT NULL,
  mission_type_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. RLS
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_behaviors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_roles"
  ON public.roles FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "admin_full_access_profile_roles"
  ON public.profile_roles FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "admin_full_access_role_behaviors"
  ON public.role_behaviors FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "authenticated_read_roles"
  ON public.roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_role_behaviors"
  ON public.role_behaviors FOR SELECT TO authenticated USING (true);

CREATE POLICY "users_read_own_profile_roles"
  ON public.profile_roles FOR SELECT
  USING (profile_id = auth.uid());

-- 5. Replace aptitude-based draft creation policy with role-based one
DROP POLICY IF EXISTS "benevoles_insert_draft_with_aptitude" ON public.missions;

CREATE POLICY "benevoles_insert_draft_with_role"
  ON public.missions FOR INSERT
  WITH CHECK (
    status = 'draft'
    AND created_by = auth.uid()
    AND public.current_user_role() = 'benevole'
    AND EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      JOIN public.role_behaviors rb ON rb.role_id = pr.role_id
      WHERE pr.profile_id = auth.uid()
        AND rb.behavior_type = 'can_create'
        AND (
          rb.mission_type_ids = '{}'
          OR mission_type_id = ANY(rb.mission_type_ids)
        )
    )
  );

-- 6. Update can_manage_mission to include can_manage role behavior
CREATE OR REPLACE FUNCTION public.can_manage_mission(_mission_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.missions m
    JOIN public.profiles p ON p.id = _user_id
    WHERE m.id = _mission_id
      AND (
        p.role = 'admin'
        OR m.created_by = _user_id
        OR EXISTS (
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
  );
$$;

-- 7. Update can_read_mission to use role_behaviors with required_for_visibility
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
            -- Aucun comportement required_for_visibility ne couvre ce type : fallback
            OR (
              NOT EXISTS (
                SELECT 1
                FROM public.role_behaviors rb
                WHERE rb.behavior_type = 'required_for_visibility'
                  AND (rb.mission_type_ids = '{}' OR m.mission_type_id = ANY(rb.mission_type_ids))
              )
              AND public.is_mission_proposed_to(m.id, _user_id)
            )
          )
        )
      )
  );
$$;
