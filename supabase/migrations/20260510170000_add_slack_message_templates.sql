-- Templates de messages Slack configurables par l'admin.
-- Chaque type correspond à une notification automatique envoyée par le système.
-- Les templates utilisent la syntaxe {{variable}} pour les valeurs dynamiques.
-- Une ligne contenant un placeholder dont la valeur est nulle est supprimée du message final.

CREATE TABLE slack_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  template text NOT NULL,
  available_variables jsonb NOT NULL DEFAULT '[]',
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE slack_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_slack_templates"
  ON slack_message_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "admin_write_slack_templates"
  ON slack_message_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

INSERT INTO slack_message_templates (type, label, description, template, available_variables) VALUES
(
  'mission_channel_welcome',
  'Bienvenue dans le canal de mission',
  'Envoyé dans le canal Slack lors de la création du canal pour une mission.',
  'Bienvenue dans le canal de mission *{{mission_title}}*.
📅 {{datetime_range}}
📍 {{location}}
{{crew_composition}}
Consultez Timeline pour les détails et mises à jour.',
  '[{"key":"mission_title","label":"Titre de la mission"},{"key":"datetime_range","label":"Plage horaire"},{"key":"location","label":"Lieu (ligne supprimée si absent)"},{"key":"crew_composition","label":"Composition de l''équipe (ligne supprimée si absente)"}]'
),
(
  'admin_availability_updated_dm',
  'Changement de disponibilité par un admin',
  'Message privé envoyé au bénévole quand un admin modifie sa disponibilité pour une mission.',
  'Bonjour {{volunteer_name}},
Un administrateur a modifié votre disponibilité pour l''événement *{{mission_title}}*.
Changement : {{previous_availability}} → {{next_availability}}.
📅 {{datetime_range}}
Voir l''événement : {{mission_url}}',
  '[{"key":"volunteer_name","label":"Nom du bénévole"},{"key":"mission_title","label":"Titre de la mission"},{"key":"previous_availability","label":"Disponibilité précédente"},{"key":"next_availability","label":"Nouvelle disponibilité"},{"key":"datetime_range","label":"Plage horaire"},{"key":"mission_url","label":"URL de la mission (ligne supprimée si absente)"}]'
),
(
  'volunteer_rejected_dm',
  'Non-sélection pour une mission',
  'Message privé envoyé au bénévole quand il n''est pas retenu pour une mission.',
  'Bonjour {{volunteer_name}},
Merci pour votre disponibilité pour la mission *{{mission_title}}*.
Vous n''avez pas été retenu·e pour cette mission.
📅 {{datetime_range}}
Voir Timeline : {{mission_url}}',
  '[{"key":"volunteer_name","label":"Nom du bénévole"},{"key":"mission_title","label":"Titre de la mission"},{"key":"datetime_range","label":"Plage horaire"},{"key":"mission_url","label":"URL de la mission (ligne supprimée si absente)"}]'
),
(
  'mission_confirmed_dm',
  'Confirmation de mission',
  'Message privé envoyé au créateur de la mission quand elle est confirmée.',
  'Bonjour {{volunteer_name}},
Votre mission *{{mission_title}}* a été confirmée ✅.
📅 {{datetime_range}}
Voir la mission : {{mission_url}}',
  '[{"key":"volunteer_name","label":"Nom du créateur"},{"key":"mission_title","label":"Titre de la mission"},{"key":"datetime_range","label":"Plage horaire"},{"key":"mission_url","label":"URL de la mission (ligne supprimée si absente)"}]'
),
(
  'mission_cancelled_dm',
  'Annulation de mission',
  'Message privé envoyé au créateur de la mission quand elle est annulée.',
  'Bonjour {{volunteer_name}},
Votre mission *{{mission_title}}* a été annulée ❌.
📅 {{datetime_range}}
Voir la mission : {{mission_url}}',
  '[{"key":"volunteer_name","label":"Nom du créateur"},{"key":"mission_title","label":"Titre de la mission"},{"key":"datetime_range","label":"Plage horaire"},{"key":"mission_url","label":"URL de la mission (ligne supprimée si absente)"}]'
),
(
  'admin_role_updated_dm',
  'Changement de rôle par un admin',
  'Message privé envoyé au bénévole quand un admin change son rôle sur Timeline.',
  'Bonjour {{volunteer_name}},
Un administrateur a modifié votre statut sur Timeline.
Changement : {{previous_role}} → {{next_role}}.',
  '[{"key":"volunteer_name","label":"Nom du bénévole"},{"key":"previous_role","label":"Rôle précédent"},{"key":"next_role","label":"Nouveau rôle"}]'
);
