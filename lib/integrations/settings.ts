// Lecture/écriture des réglages d'intégration (table integration_settings,
// accessible uniquement en service role — elle contient des secrets).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IntegrationDefinition } from './registry';

export async function loadIntegrationSettings(
  serviceClient: SupabaseClient,
  provider: string
): Promise<Record<string, unknown>> {
  const { data, error } = await serviceClient
    .from('integration_settings')
    .select('settings')
    .eq('provider', provider)
    .maybeSingle();
  if (error) throw new Error(`Lecture des réglages ${provider} : ${error.message}`);
  const settings = data?.settings;
  return settings && typeof settings === 'object' && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : {};
}

// Fusionne des mises à jour partielles : une clé absente est conservée, une
// chaîne vide ou null efface la valeur (y compris un secret), une valeur non
// vide la remplace. Seules les clés déclarées dans la définition sont admises.
export async function saveIntegrationSettings(
  serviceClient: SupabaseClient,
  definition: IntegrationDefinition,
  updates: Record<string, unknown>,
  updatedBy: string | null
): Promise<Record<string, unknown>> {
  const current = await loadIntegrationSettings(serviceClient, definition.key);
  const next: Record<string, unknown> = { ...current };

  for (const field of definition.fields) {
    if (!(field.key in updates)) continue;
    const raw = updates[field.key];
    if (raw === null || raw === '') {
      delete next[field.key];
      continue;
    }
    if (typeof raw !== 'string') {
      throw new Error(`Le champ ${field.label} doit être une chaîne.`);
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      delete next[field.key];
      continue;
    }
    next[field.key] = trimmed;
  }

  const { error } = await serviceClient.from('integration_settings').upsert({
    provider: definition.key,
    settings: next,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy
  });
  if (error) throw new Error(`Enregistrement des réglages ${definition.key} : ${error.message}`);

  return next;
}

export function getSettingString(settings: Record<string, unknown>, key: string): string | null {
  const value = settings[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// Vue « sans secrets » d'une configuration, renvoyable au client : valeurs des
// champs non secrets + indicateur « défini » pour les champs secrets.
export function maskIntegrationSettings(definition: IntegrationDefinition, settings: Record<string, unknown>) {
  const values: Record<string, string | null> = {};
  const secretsSet: Record<string, boolean> = {};
  for (const field of definition.fields) {
    if (field.secret) {
      secretsSet[field.key] = Boolean(getSettingString(settings, field.key));
    } else {
      values[field.key] = getSettingString(settings, field.key);
    }
  }
  return { values, secretsSet };
}

export function isIntegrationConfigured(definition: IntegrationDefinition, settings: Record<string, unknown>) {
  return definition.fields
    .filter((field) => field.required)
    .every((field) => Boolean(getSettingString(settings, field.key)));
}
