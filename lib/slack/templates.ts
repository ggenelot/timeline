import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export type TemplateVariable = {
  key: string;
  label: string;
};

export type SlackMessageTemplate = {
  type: string;
  label: string;
  description: string | null;
  template: string;
  available_variables: TemplateVariable[];
  enabled: boolean;
  updated_at: string;
};

export const DEFAULT_TEMPLATES: Record<string, string> = {
  mission_channel_welcome: `Bienvenue dans le canal de mission *{{mission_title}}*.
📅 {{datetime_range}}
📍 {{location}}
{{crew_composition}}
Consultez Timeline pour les détails et mises à jour.`,

  admin_availability_updated_dm: `Bonjour {{volunteer_name}},
Un administrateur a modifié votre disponibilité pour l'événement *{{mission_title}}*.
Changement : {{previous_availability}} → {{next_availability}}.
📅 {{datetime_range}}
Voir l'événement : {{mission_url}}`,

  volunteer_rejected_dm: `Bonjour {{volunteer_name}},
Merci pour votre disponibilité pour la mission *{{mission_title}}*.
Vous n'avez pas été retenu·e pour cette mission.
📅 {{datetime_range}}
Voir Timeline : {{mission_url}}`,

  mission_confirmed_dm: `Bonjour {{volunteer_name}},
Votre mission *{{mission_title}}* a été confirmée ✅.
📅 {{datetime_range}}
Voir la mission : {{mission_url}}`,

  mission_cancelled_dm: `Bonjour {{volunteer_name}},
Votre mission *{{mission_title}}* a été annulée ❌.
📅 {{datetime_range}}
Voir la mission : {{mission_url}}`,

  admin_role_updated_dm: `Bonjour {{volunteer_name}},
Un administrateur a modifié votre statut sur Timeline.
Changement : {{previous_role}} → {{next_role}}.`,

  doublure_supervisor_dm: `Bonjour {{supervisor_name}},
{{trainee_name}} vous a désigné·e comme doubleur·se pour la doublure *{{event_name}}* ({{cursus_code}} · {{phase_label}}).
📅 {{event_date}}
Pensez à laisser votre commentaire pédagogique et à cocher les compétences validées : {{doublures_url}}`
};

export const TEMPLATE_DISABLED_MESSAGE = "Notification désactivée dans l'Admin Slack.";

export function applyTemplate(template: string, variables: Record<string, string | null | undefined>): string {
  return template
    .split('\n')
    .map((line) => {
      let processed = line;
      for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        if (processed.includes(placeholder)) {
          if (value == null || value === '') {
            return null;
          }
          processed = processed.split(placeholder).join(value);
        }
      }
      return processed;
    })
    .filter((line): line is string => line !== null)
    .join('\n');
}

export async function getTemplateText(type: string): Promise<string> {
  try {
    const serviceClient = createServerSupabaseServiceClient();
    const { data } = await serviceClient.from('slack_message_templates').select('template').eq('type', type).maybeSingle();
    return data?.template || DEFAULT_TEMPLATES[type] || '';
  } catch {
    return DEFAULT_TEMPLATES[type] || '';
  }
}

// Un template absent de la base (migration non appliquée) reste actif.
export async function isTemplateEnabled(type: string): Promise<boolean> {
  try {
    const serviceClient = createServerSupabaseServiceClient();
    const { data } = await serviceClient.from('slack_message_templates').select('enabled').eq('type', type).maybeSingle();
    return data?.enabled ?? true;
  } catch {
    return true;
  }
}
