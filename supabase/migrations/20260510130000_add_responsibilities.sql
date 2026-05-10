-- Responsibilities: named roles that can be assigned to a volunteer (e.g. "Responsable PSC1")
CREATE TABLE public.responsibilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One volunteer assigned per responsibility
CREATE TABLE public.responsibility_holders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  responsibility_id uuid NOT NULL REFERENCES public.responsibilities(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (responsibility_id)
);

-- Which responsibilities are automatically invited per mission category
CREATE TABLE public.mission_category_responsibilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('maraude', 'garde', 'formation', 'vie_antenne', 'poste_de_secours')),
  responsibility_id uuid NOT NULL REFERENCES public.responsibilities(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, responsibility_id)
);

-- RLS
ALTER TABLE public.responsibilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responsibility_holders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_category_responsibilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to responsibilities"
  ON public.responsibilities FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin full access to responsibility_holders"
  ON public.responsibility_holders FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin full access to mission_category_responsibilities"
  ON public.mission_category_responsibilities FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow service role to read for Slack workflow (no RLS bypass needed with service client)

-- Extend slack_notification_logs type check to include responsibility holder invites
ALTER TABLE slack_notification_logs
  DROP CONSTRAINT IF EXISTS slack_notification_logs_type_check;

ALTER TABLE slack_notification_logs
  ADD CONSTRAINT slack_notification_logs_type_check
  CHECK (type = ANY (ARRAY[
    'volunteer_rejected_dm',
    'mission_channel_created',
    'mission_channel_welcome',
    'mission_channel_invite',
    'admin_availability_updated_dm',
    'admin_role_updated_dm',
    'responsibility_holder_invite'
  ]));
