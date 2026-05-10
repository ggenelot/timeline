ALTER TABLE slack_notification_logs
  DROP CONSTRAINT slack_notification_logs_type_check;

ALTER TABLE slack_notification_logs
  ADD CONSTRAINT slack_notification_logs_type_check
  CHECK (type = ANY (ARRAY[
    'volunteer_rejected_dm',
    'mission_channel_created',
    'mission_channel_welcome',
    'mission_channel_invite',
    'admin_availability_updated_dm',
    'admin_role_updated_dm'
  ]));
