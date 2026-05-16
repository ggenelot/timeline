-- One-shot backfill: assign the default role to all existing volunteers who have none.
-- New volunteers are already handled by the trigger trg_assign_default_role (migration 20260516150000).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE is_default = true) THEN
    RAISE EXCEPTION 'No default role found. Set a default role before running this migration.';
  END IF;

  INSERT INTO public.profile_roles (profile_id, role_id)
  SELECT p.id, r.id
  FROM public.profiles p
  CROSS JOIN public.roles r
  WHERE r.is_default = true
    AND NOT EXISTS (
      SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = p.id
    )
  ON CONFLICT (profile_id, role_id) DO NOTHING;
END $$;
