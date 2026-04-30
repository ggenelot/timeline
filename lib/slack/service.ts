import { getSlackConfig, requireSlackEnv } from '@/lib/slack/config';

type SlackApiSuccess<T> = { ok: true } & T;
type SlackApiError = { ok: false; error: string };

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

export class SlackService {
  private botToken: string;

  constructor() {
    this.botToken = requireSlackEnv('SLACK_BOT_TOKEN');
  }

  private async callApi<T>(method: string, payload: Record<string, unknown>) {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const json = (await response.json()) as SlackApiResponse<T>;

    if (!response.ok || !json.ok) {
      throw new Error(`Slack API ${method} failed: ${'error' in json ? json.error : `HTTP ${response.status}`}`);
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



  async getUserInfo(slackUserId: string) {
    return this.callApi<{ user?: { name?: string } }>('users.info', {
      user: slackUserId
    });
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

  static async exchangeOAuthCode(code: string) {
    const config = getSlackConfig();

    if (!config.clientId || !config.clientSecret) {
      throw new Error('Missing Slack OAuth client credentials.');
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code
    });

    if (config.redirectUri) {
      params.set('redirect_uri', config.redirectUri);
    }

    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    const json = (await response.json()) as SlackApiResponse<SlackOAuthAccessResponse>;

    if (!response.ok || !json.ok) {
      throw new Error(`Slack OAuth failed: ${'error' in json ? json.error : `HTTP ${response.status}`}`);
    }

    return json;
  }
}
