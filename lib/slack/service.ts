import { getSlackAuthRedirectUri, getSlackConfig, requireSlackEnv } from '@/lib/slack/config';

type SlackApiSuccess<T> = { ok: true } & T;
type SlackApiError = { ok: false; error: string; needed?: string; provided?: string };

type SlackApiResponse<T> = SlackApiSuccess<T> | SlackApiError;

export type SlackOAuthAccessResponse = {
  authed_user?: {
    id?: string;
    access_token?: string;
  };
  team?: {
    id?: string;
    name?: string;
  };
};

export type SlackOpenIdUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  'https://slack.com/team_id'?: string;
};

export type SlackOpenIdTokenResponse = {
  access_token?: string;
  id_token?: string;
  token_type?: string;
};

type SlackFlow = 'bot_install' | 'slack_login';

export type SlackUserProfileImages = {
  image_192?: string;
  image_512?: string;
  image_1024?: string;
  image_72?: string;
};

export function pickSlackAvatarUrl(profile: SlackUserProfileImages | null | undefined): string | null {
  if (!profile) return null;
  return profile.image_512 ?? profile.image_1024 ?? profile.image_192 ?? profile.image_72 ?? null;
}


const SLACK_ERROR_MESSAGES: Record<string, string> = {
  token_absent: 'Token Slack manquant. Configurez SLACK_BOT_TOKEN côté serveur.',
  missing_scope: "Le bot Slack n'a pas les permissions nécessaires (scope manquant).",
  not_in_channel: "Le bot Slack n'est pas membre du canal cible.",
  name_taken: 'Ce nom de canal Slack est déjà utilisé.',
  user_not_found: 'Utilisateur Slack introuvable.',
};

export class SlackApiClientError extends Error {
  code: string;
  needed?: string;
  provided?: string;

  constructor(code: string, method: string, needed?: string, provided?: string) {
    super(SLACK_ERROR_MESSAGES[code] ?? `Slack API ${method} failed: ${code}`);
    this.name = 'SlackApiClientError';
    this.code = code;
    this.needed = needed;
    this.provided = provided;
  }
}

export class SlackService {
  private botToken: string;

  constructor() {
    this.botToken = requireSlackEnv('SLACK_BOT_TOKEN');
  }

  private async callApi<T>(method: string, payload: Record<string, unknown>, accessToken = this.botToken) {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const json = (await response.json()) as SlackApiResponse<T>;

    if (!response.ok || !json.ok) {
      const code = 'error' in json ? json.error : `http_${response.status}`;
      const needed = 'needed' in json ? json.needed : undefined;
      const provided = 'provided' in json ? json.provided : undefined;
      throw new SlackApiClientError(code, method, needed, provided);
    }

    return json;
  }

  async openDirectMessage(slackUserId: string) {
    const result = await this.callApi<{ channel?: { id?: string } }>('conversations.open', {
      users: slackUserId
    });

    const channelId = result.channel?.id;
    if (!channelId) {
      throw new Error('Slack API conversations.open did not return a channel id.');
    }

    return channelId;
  }

  async postMessage(channel: string, text: string) {
    return this.callApi('chat.postMessage', { channel, text });
  }

  async createPrivateChannel(name: string) {
    return this.callApi<{ channel?: { id?: string; name?: string } }>('conversations.create', {
      name,
      is_private: true
    });
  }

  async listPrivateChannels() {
    return this.callApi<{ channels?: Array<{ id: string; name: string }> }>('conversations.list', {
      types: 'private_channel',
      exclude_archived: true,
      limit: 1000
    });
  }



  async getUserInfo(slackUserId: string, accessToken?: string) {
    return this.callApi<{ user?: { name?: string; profile?: SlackUserProfileImages } }>('users.info', {
      user: slackUserId
    }, accessToken);
  }

  async authTest() {
    return this.callApi<{ team?: string; team_id?: string; user_id?: string; bot_id?: string }>('auth.test', {});
  }

  async listGrantedScopes() {
    return this.callApi<{ scopes?: { app_home?: string[]; team?: string[]; channel?: string[]; group?: string[]; im?: string[]; mpim?: string[] } }>('apps.permissions.info', {});
  }

  async inviteUsersToChannel(channel: string, users: string[]) {
    if (users.length === 0) {
      return;
    }

    return this.callApi('conversations.invite', {
      channel,
      users: users.join(',')
    });
  }

  static async exchangeOAuthCode(code: string, mode: 'connect' | 'auth' = 'connect') {
    const config = getSlackConfig();

    if (!config.clientId || !config.clientSecret) {
      throw new Error('Missing Slack OAuth client credentials.');
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code
    });

    const redirectUri = mode === 'auth' ? getSlackAuthRedirectUri() : config.redirectUri;
    if (redirectUri) {
      params.set('redirect_uri', redirectUri);
    }

    const endpoint = 'https://slack.com/api/oauth.v2.access';
    const flow: SlackFlow = mode === 'connect' ? 'bot_install' : 'slack_login';
    console.info('[slack-oauth]', { flow, step: 'oauth_v2_exchange_start', endpoint_token: endpoint, redirect_uri: redirectUri ?? null });
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    const json = (await response.json()) as SlackApiResponse<SlackOAuthAccessResponse>;

    console.info('[slack-oauth]', { flow, step: 'oauth_v2_exchange_response', status: response.status, slack_ok: Boolean((json as { ok?: boolean }).ok) });
    if (!response.ok || !json.ok) {
      const slackError = 'error' in json ? json.error : 'unknown_error';
      const error = new Error(`oauth_exchange_failed:${slackError}`);
      (error as Error & { details?: Record<string, unknown> }).details = {
        flow,
        endpoint_token: endpoint,
        error: slackError,
        status: response.status,
        redirect_uri: redirectUri ?? null
      };
      throw error;
    }

    return json;
  }

  static async exchangeOpenIdCode(code: string) {
    const config = getSlackConfig();
    const redirectUri = getSlackAuthRedirectUri();
    const endpoint = 'https://slack.com/api/openid.connect.token';

    if (!config.clientId || !config.clientSecret) {
      throw new Error('Missing Slack OAuth client credentials.');
    }
    if (!redirectUri) {
      throw new Error('Missing Slack auth redirect URI.');
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri
    });

    console.info('[slack-oauth]', { flow: 'slack_login', step: 'openid_token_exchange_start', endpoint_token: endpoint, redirect_uri: redirectUri });
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    const json = (await response.json()) as SlackApiResponse<SlackOpenIdTokenResponse>;

    console.info('[slack-oauth]', { flow: 'slack_login', step: 'openid_token_exchange_response', status: response.status, slack_ok: Boolean((json as { ok?: boolean }).ok) });
    if (!response.ok || !json.ok) {
      const slackError = 'error' in json ? json.error : 'unknown_error';
      const error = new Error('openid_token_exchange_failed');
      (error as Error & { details?: Record<string, unknown> }).details = {
        flow: 'slack_login',
        endpoint,
        endpoint_token: endpoint,
        error: slackError,
        status: response.status,
        redirectUri
      };
      throw error;
    }

    return {
      access_token: json.access_token,
      id_token: json.id_token,
      token_type: json.token_type
    };
  }

  static async getOpenIdUserInfo(userAccessToken: string) {
    console.info('[slack-oauth]', { flow: 'slack_login', step: 'openid_userinfo_start', endpoint: 'https://slack.com/api/openid.connect.userInfo' });
    const response = await fetch('https://slack.com/api/openid.connect.userInfo', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${userAccessToken}`
      }
    });

    const json = (await response.json()) as SlackApiResponse<SlackOpenIdUserInfo>;
    console.info('[slack-oauth]', { flow: 'slack_login', step: 'openid_userinfo_response', status: response.status, slack_ok: Boolean((json as { ok?: boolean }).ok) });
    if (!response.ok || !json.ok) {
      throw new Error(`Slack OpenID userInfo failed: ${'error' in json ? json.error : `HTTP ${response.status}`}`);
    }

    return json;
  }
}
