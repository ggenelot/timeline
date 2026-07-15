// Client HTTP minimal pour l'API REST eOPE (OAuth 2.1, jetons opaques ~1 h).
// Un client = un run de synchronisation : le jeton client_credentials est
// obtenu paresseusement au premier appel, gardé en mémoire pour la durée du
// run, jamais persisté. Sur un 401 en cours de run (jeton révoqué), on
// re-demande un jeton une seule fois avant d'abandonner.

import { isEopeConfigured, type EopeConfig } from './config';

export class EopeApiError extends Error {
  status: number;
  code: string | null;
  body: unknown;

  constructor(message: string, status: number, code: string | null = null, body: unknown = null) {
    super(message);
    this.name = 'EopeApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export class EopeConfigurationError extends Error {
  constructor(message = "L'intégration eOPE n'est pas configurée (URL du serveur, client ID et client secret requis — voir /admin/integrations/eope).") {
    super(message);
    this.name = 'EopeConfigurationError';
  }
}

type TokenResponse = {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  scope?: unknown;
};

function extractErrorMessage(body: unknown, fallback: string) {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    for (const key of ['error_description', 'message', 'detail', 'error']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
  }
  return fallback;
}

function extractErrorCode(body: unknown) {
  if (body && typeof body === 'object') {
    const value = (body as Record<string, unknown>).error;
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

export class EopeClient {
  private config: EopeConfig;
  private scopes: string[];
  private token: string | null = null;

  constructor(scopes: string[], config: EopeConfig) {
    this.config = config;
    this.scopes = scopes;
  }

  isConfigured() {
    return isEopeConfigured(this.config);
  }

  private baseUrl() {
    if (!this.isConfigured()) throw new EopeConfigurationError();
    return this.config.baseUrl as string;
  }

  private async fetchToken(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId as string,
      client_secret: this.config.clientSecret as string
    });
    if (this.scopes.length > 0) {
      body.set('scope', this.scopes.join(' '));
    }

    const response = await fetch(`${this.baseUrl()}/api/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      cache: 'no-store'
    });

    const payload: TokenResponse | null = await response.json().catch(() => null);

    if (!response.ok || typeof payload?.access_token !== 'string' || !payload.access_token) {
      throw new EopeApiError(
        extractErrorMessage(payload, `Échec de l'obtention du jeton eOPE (HTTP ${response.status}).`),
        response.status,
        extractErrorCode(payload),
        payload
      );
    }

    return payload.access_token;
  }

  private async request(method: 'GET' | 'POST' | 'DELETE', path: string, jsonBody?: unknown, isRetry = false): Promise<Response> {
    if (!this.token) {
      this.token = await this.fetchToken();
    }

    const response = await fetch(`${this.baseUrl()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(jsonBody !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: jsonBody !== undefined ? JSON.stringify(jsonBody) : undefined,
      cache: 'no-store'
    });

    // Jeton expiré/révoqué en cours de run : une seule tentative de renouvellement.
    if (response.status === 401 && !isRetry) {
      this.token = null;
      return this.request(method, path, jsonBody, true);
    }

    return response;
  }

  private async parseOrThrow(response: Response, context: string): Promise<unknown> {
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const code = extractErrorCode(payload);
      const message =
        response.status === 403 && code === 'insufficient_scope'
          ? `${context} : portée OAuth insuffisante (vérifier les portées de l'application eOPE).`
          : extractErrorMessage(payload, `${context} : HTTP ${response.status}.`);
      throw new EopeApiError(message, response.status, code, payload);
    }

    return payload;
  }

  async get(path: string, context: string): Promise<unknown> {
    return this.parseOrThrow(await this.request('GET', path, undefined), context);
  }

  async post(path: string, body: unknown, context: string): Promise<unknown> {
    return this.parseOrThrow(await this.request('POST', path, body), context);
  }

  // DELETE : un 404 signifie « déjà supprimé côté eOPE » et est traité comme
  // un succès par les appelants (réconciliation idempotente).
  async delete(path: string, context: string): Promise<{ status: number }> {
    const response = await this.request('DELETE', path, undefined);
    if (!response.ok && response.status !== 404) {
      const payload: unknown = await response.json().catch(() => null);
      throw new EopeApiError(
        extractErrorMessage(payload, `${context} : HTTP ${response.status}.`),
        response.status,
        extractErrorCode(payload),
        payload
      );
    }
    return { status: response.status };
  }
}
