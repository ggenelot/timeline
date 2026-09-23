-- Notification Slack au doubleur désigné sur une doublure, et interrupteur
-- d'activation par notification dans l'Admin Slack.

-- Désactiver un template coupe l'envoi de la notification correspondante
-- (le passage est journalisé en « skipped »).
alter table public.slack_message_templates
  add column if not exists enabled boolean not null default true;

insert into public.slack_message_templates (type, label, description, template, available_variables) values
(
  'doublure_supervisor_dm',
  'Doublure à commenter (doubleur)',
  'Message privé envoyé au doubleur quand une doublure le désigne comme doubleur (déclaration ou changement de doubleur).',
  'Bonjour {{supervisor_name}},
{{trainee_name}} vous a désigné·e comme doubleur·se pour la doublure *{{event_name}}* ({{cursus_code}} · {{phase_label}}).
📅 {{event_date}}
Pensez à laisser votre commentaire pédagogique et à cocher les compétences validées : {{doublures_url}}',
  '[{"key":"supervisor_name","label":"Nom du doubleur"},{"key":"trainee_name","label":"Nom du stagiaire"},{"key":"event_name","label":"Événement de la doublure"},{"key":"event_date","label":"Date de l''événement (ligne supprimée si absente)"},{"key":"cursus_code","label":"Code du cursus"},{"key":"cursus_name","label":"Nom du cursus"},{"key":"phase_label","label":"Phase du cursus"},{"key":"declared_by_name","label":"Personne ayant déclaré la doublure"},{"key":"doublures_url","label":"Lien vers « Doublures que j''encadre » (ligne supprimée si absent)"}]'
)
on conflict (type) do nothing;

alter table public.slack_notification_logs
  drop constraint if exists slack_notification_logs_type_check;

alter table public.slack_notification_logs
  add constraint slack_notification_logs_type_check check (
    type in (
      'volunteer_rejected_dm',
      'mission_channel_created',
      'mission_channel_welcome',
      'mission_channel_invite',
      'mission_channel_manual_message',
      'admin_availability_updated_dm',
      'admin_role_updated_dm',
      'responsibility_holder_invite',
      'mission_confirmed_dm',
      'mission_cancelled_dm',
      'doublure_supervisor_dm'
    )
  );
