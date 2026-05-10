ALTER TABLE public.slack_notification_logs
  DROP CONSTRAINT IF EXISTS slack_notification_logs_type_check;

ALTER TABLE public.slack_notification_logs
  ADD CONSTRAINT slack_notification_logs_type_check CHECK (
    type IN (
      'volunteer_rejected_dm',
      'mission_channel_created',
      'mission_channel_welcome',
      'mission_channel_invite',
      'mission_channel_manual_message',
      'admin_availability_updated_dm',
      'admin_role_updated_dm',
      'responsibility_holder_invite',
      'mission_confirmed_dm',
      'mission_cancelled_dm'
    )
  );
