// Configuration de l'intégration eOPE (système départemental externe, sans
// rapport avec le tableau de bord interne « OPE »).
//
// La configuration se fait depuis l'UI (/admin/integrations/eope, stockée dans
// integration_settings) ; les variables d'environnement EOPE_* restent
// acceptées en repli pour les déploiements qui préfèrent cette voie. Absente
// des deux côtés, l'intégration est simplement désactivée.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getIntegrationDefinition } from '@/lib/integrations/registry';
import { getSettingString, loadIntegrationSettings } from '@/lib/integrations/settings';

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

const DEFAULT_SYNC_WINDOW_DAYS = 90;

export const EOPE_INTEGRATION_KEY = 'eope';

export type EopeConfig = {
  baseUrl: string | null;
  clientId: string | null;
  clientSecret: string | null;
  syncWindowDays: number;
  cronSecret: string | null;
};

function parseWindowDays(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// Repli environnement uniquement (aussi utilisé pour CRON_SECRET, qui reste
// une variable d'environnement : il protège la route de cron elle-même).
export function getEopeEnvConfig(): EopeConfig {
  return {
    baseUrl: optionalEnv('EOPE_BASE_URL')?.replace(/\/+$/, '') ?? null,
    clientId: optionalEnv('EOPE_CLIENT_ID'),
    clientSecret: optionalEnv('EOPE_CLIENT_SECRET'),
    syncWindowDays: parseWindowDays(optionalEnv('EOPE_SYNC_WINDOW_DAYS')) ?? DEFAULT_SYNC_WINDOW_DAYS,
    cronSecret: optionalEnv('CRON_SECRET')
  };
}

// Configuration effective : réglages saisis dans l'UI d'abord, environnement
// en repli, champ par champ.
export async function resolveEopeConfig(serviceClient: SupabaseClient): Promise<EopeConfig> {
  const env = getEopeEnvConfig();
  const definition = getIntegrationDefinition(EOPE_INTEGRATION_KEY);
  if (!definition) return env;

  const stored = await loadIntegrationSettings(serviceClient, EOPE_INTEGRATION_KEY);

  return {
    baseUrl: getSettingString(stored, 'base_url')?.replace(/\/+$/, '') ?? env.baseUrl,
    clientId: getSettingString(stored, 'client_id') ?? env.clientId,
    clientSecret: getSettingString(stored, 'client_secret') ?? env.clientSecret,
    syncWindowDays:
      parseWindowDays(getSettingString(stored, 'sync_window_days')) ?? env.syncWindowDays,
    cronSecret: env.cronSecret
  };
}

export function isEopeConfigured(config: EopeConfig) {
  return Boolean(config.baseUrl && config.clientId && config.clientSecret);
}
