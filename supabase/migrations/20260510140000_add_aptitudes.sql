-- Aptitudes: defines what mission categories a volunteer is allowed to create in draft
CREATE TABLE public.aptitudes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  allowed_categories text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Many-to-many: multiple volunteers can have the same aptitude, cumulative
CREATE TABLE public.profile_aptitudes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  aptitude_id uuid NOT NULL REFERENCES public.aptitudes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, aptitude_id)
);

-- RLS
ALTER TABLE public.aptitudes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_aptitudes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_aptitudes"
  ON public.aptitudes FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "admin_full_access_profile_aptitudes"
  ON public.profile_aptitudes FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Volunteers can read aptitudes they hold (to know what they can create)
CREATE POLICY "users_read_held_aptitudes"
  ON public.aptitudes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profile_aptitudes pa
      WHERE pa.aptitude_id = aptitudes.id AND pa.profile_id = auth.uid()
    )
  );

CREATE POLICY "users_read_own_profile_aptitudes"
  ON public.profile_aptitudes FOR SELECT
  USING (profile_id = auth.uid());

-- Allow volunteers with the right aptitude to insert draft missions
CREATE POLICY "benevoles_insert_draft_with_aptitude"
  ON public.missions FOR INSERT
  WITH CHECK (
    status = 'draft'
    AND created_by = auth.uid()
    AND public.current_user_role() = 'benevole'
    AND EXISTS (
      SELECT 1
      FROM public.profile_aptitudes pa
      JOIN public.aptitudes a ON a.id = pa.aptitude_id
      WHERE pa.profile_id = auth.uid()
        AND category::text = ANY(a.allowed_categories)
    )
  );

-- Extend missions SELECT so volunteers can also see their own draft missions
DROP POLICY IF EXISTS "missions_select_by_role" ON public.missions;
CREATE POLICY "missions_select_by_role"
  ON public.missions FOR SELECT
  USING (
    public.current_user_role() IN ('admin', 'responsable')
    OR (
      public.current_user_role() = 'benevole'
      AND (
        public.is_mission_proposed_to(missions.id, auth.uid())
        OR (status = 'draft' AND created_by = auth.uid())
      )
    )
  );
