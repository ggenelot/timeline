import { NextResponse } from 'next/server';
import { createSlackOAuthState } from '@/lib/slack/auth';
import { getSlackConfig } from '@/lib/slack/config';

const USER_SCOPES = ['users:read'];

export async function POST() {
  const config = getSlackConfig();
  if (!config.clientId) {
    return NextResponse.json({ error: 'Configuration Slack OAuth incomplète.' }, { status: 500 });
  }

  const appBaseUrl = config.appBaseUrl;
  const redirectUri = config.authRedirectUri ?? (appBaseUrl ? `${appBaseUrl}/api/auth/slack/callback` : null);
  if (!redirectUri) {
    return NextResponse.json({ error: 'SLACK_AUTH_REDIRECT_URI (ou APP_BASE_URL) manquant.' }, { status: 500 });
  }

  const state = await createSlackOAuthState(null, 'login');
  const oauthUrl = new URL('https://slack.com/oauth/v2/authorize');
  oauthUrl.searchParams.set('client_id', config.clientId);
  oauthUrl.searchParams.set('user_scope', USER_SCOPES.join(','));
  oauthUrl.searchParams.set('state', state);
  oauthUrl.searchParams.set('redirect_uri', redirectUri);

  return NextResponse.json({ oauthUrl: oauthUrl.toString(), type: 'auth_slack_login_start' });
}
