// Configuration de l'intégration eOPE (système départemental externe, sans
// rapport avec le tableau de bord interne « OPE »). Même philosophie que
// lib/slack/config.ts : tout vient de l'environnement, tout est optionnel, et
// l'absence de configuration désactive simplement l'intégration.

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

const DEFAULT_SYNC_WINDOW_DAYS = 90;

export type EopeConfig = {
  baseUrl: string | null;
  clientId: string | null;
  clientSecret: string | null;
  syncWindowDays: number;
  cronSecret: string | null;
};

export function getEopeConfig(): EopeConfig {
  const windowRaw = optionalEnv('EOPE_SYNC_WINDOW_DAYS');
  const windowParsed = windowRaw ? Number.parseInt(windowRaw, 10) : NaN;

  return {
    baseUrl: optionalEnv('EOPE_BASE_URL')?.replace(/\/+$/, '') ?? null,
    clientId: optionalEnv('EOPE_CLIENT_ID'),
    clientSecret: optionalEnv('EOPE_CLIENT_SECRET'),
    syncWindowDays:
      Number.isFinite(windowParsed) && windowParsed > 0 ? windowParsed : DEFAULT_SYNC_WINDOW_DAYS,
    cronSecret: optionalEnv('CRON_SECRET')
  };
}

export function isEopeConfigured(config: EopeConfig = getEopeConfig()) {
  return Boolean(config.baseUrl && config.clientId && config.clientSecret);
}
