-- Refactor mission visibility:
-- 1. Add can_see behavior type (replaces open-access fallback)
-- 2. Add mission_statuses filter on role_behaviors
-- 3. Add is_default flag on roles with auto-assignment trigger
-- 4. Rewrite can_read_mission with the new model

-- 1. Add can_see to the enum
ALTER TYPE public.role_behavior_type ADD VALUE IF NOT EXISTS 'can_see';

-- 2. Add mission_statuses column to role_behaviors
ALTER TABLE public.role_behaviors
  ADD COLUMN IF NOT EXISTS mission_statuses public.mission_status[] NOT NULL DEFAULT '{}';

-- 3. Add is_default to roles + unique partial index (only one default role)
ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS roles_one_default
  ON public.roles (is_default)
  WHERE is_default = true;

-- 4. Trigger: auto-assign the default role to every new profile
CREATE OR REPLACE FUNCTION public.assign_default_role_to_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profile_roles (profile_id, role_id)
  SELECT NEW.id, r.id
  FROM public.roles r
  WHERE r.is_default = true
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_default_role ON public.profiles;
CREATE TRIGGER trg_assign_default_role
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.assign_default_role_to_new_profile();

-- 5. Rewrite can_read_mission
--
-- Visibility rules (in order):
--   a. admin / responsable → sees everything
--   b. can_manage behavior covering mission type → sees those missions
--   c. own draft → sees it
--   d. required_for_visibility holder → always sees missions of their covered types
--   e. can_see (type + statut) → sees mission IF:
--        - no required_for_visibility covers this type, OR
--        - at least one volunteer with required_for_visibility is available (response = 'available')
--
-- Default: nobody else sees anything (old open-access fallback removed).

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
        -- (a) admins et responsables voient tout
        public.current_user_role() IN ('admin', 'responsable')

        -- (b) can_manage → voit les missions de ses types
        OR (
          public.current_user_role() = 'benevole'
          AND EXISTS (
            SELECT 1
            FROM public.profile_roles pr
            JOIN public.role_behaviors rb ON rb.role_id = pr.role_id
            WHERE pr.profile_id = _user_id
              AND rb.behavior_type = 'can_manage'
              AND (rb.mission_type_ids = '{}' OR m.mission_type_id = ANY(rb.mission_type_ids))
          )
        )

        -- (c) brouillon créé par le bénévole lui-même
        OR (m.status = 'draft' AND m.created_by = _user_id)

        -- (d) référent required_for_visibility → voit toujours ses types de mission
        OR (
          public.current_user_role() = 'benevole'
          AND EXISTS (
            SELECT 1
            FROM public.profile_roles pr
            JOIN public.role_behaviors rb ON rb.role_id = pr.role_id
            WHERE pr.profile_id = _user_id
              AND rb.behavior_type = 'required_for_visibility'
              AND (rb.mission_type_ids = '{}' OR m.mission_type_id = ANY(rb.mission_type_ids))
          )
        )

        -- (e) can_see (type + statut) avec vérification du référent si applicable
        OR (
          public.current_user_role() = 'benevole'
          AND EXISTS (
            SELECT 1
            FROM public.profile_roles pr
            JOIN public.role_behaviors rb ON rb.role_id = pr.role_id
            WHERE pr.profile_id = _user_id
              AND rb.behavior_type = 'can_see'
              AND (rb.mission_type_ids = '{}' OR m.mission_type_id = ANY(rb.mission_type_ids))
              AND (rb.mission_statuses = '{}' OR m.status = ANY(rb.mission_statuses))
          )
          AND (
            -- Pas de required_for_visibility sur ce type → accès direct
            NOT EXISTS (
              SELECT 1
              FROM public.role_behaviors rb
              WHERE rb.behavior_type = 'required_for_visibility'
                AND (rb.mission_type_ids = '{}' OR m.mission_type_id = ANY(rb.mission_type_ids))
            )
            -- Ou au moins un référent disponible sur cette mission
            OR EXISTS (
              SELECT 1
              FROM public.mission_proposals mp
              JOIN public.profile_roles pr ON pr.profile_id = mp.volunteer_id
              JOIN public.role_behaviors rb ON rb.role_id = pr.role_id
              WHERE mp.mission_id = m.id
                AND mp.response = 'available'
                AND rb.behavior_type = 'required_for_visibility'
                AND (rb.mission_type_ids = '{}' OR m.mission_type_id = ANY(rb.mission_type_ids))
            )
          )
        )
      )
  );
$$;
