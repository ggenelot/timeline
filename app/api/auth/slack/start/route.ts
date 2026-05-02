import { NextResponse } from 'next/server';
import { createSlackOAuthState } from '@/lib/slack/auth';
import { getSlackConfig } from '@/lib/slack/config';

const OIDC_SCOPES = ['openid', 'profile', 'email'];

export async function POST() {
  const config = getSlackConfig();
  console.info('[slack-auth-start] incoming request', {
    hasClientId: Boolean(config.clientId),
    hasAppBaseUrl: Boolean(config.appBaseUrl),
    hasAuthRedirectUri: Boolean(config.authRedirectUri)
  });

  if (!config.clientId) {
    console.error('[slack-auth-start] missing Slack OAuth client id');
    return NextResponse.json({ error: 'Configuration Slack OAuth incomplète.' }, { status: 500 });
  }

  const appBaseUrl = config.appBaseUrl;
  const redirectUri = config.authRedirectUri ?? (appBaseUrl ? `${appBaseUrl}/api/auth/slack/callback` : null);
  if (!redirectUri) {
    console.error('[slack-auth-start] missing Slack auth redirect URI and APP_BASE_URL');
    return NextResponse.json({ error: 'SLACK_AUTH_REDIRECT_URI (ou APP_BASE_URL) manquant.' }, { status: 500 });
  }

  const state = await createSlackOAuthState(null, 'login');
  const slackAuthorizeOrigin = config.teamDomain ? `https://${config.teamDomain}.slack.com` : 'https://slack.com';
  const oauthUrl = new URL('/openid/connect/authorize', slackAuthorizeOrigin);
  oauthUrl.searchParams.set('client_id', config.clientId);
  oauthUrl.searchParams.set('scope', OIDC_SCOPES.join(' '));
  oauthUrl.searchParams.set('response_type', 'code');
  oauthUrl.searchParams.set('state', state);
  oauthUrl.searchParams.set('redirect_uri', redirectUri);

  console.info('[slack-auth-start] generated oauth URL', {
    redirectUri,
    hasState: Boolean(state),
    slackAuthorizeOrigin
  });

  return NextResponse.json({ oauthUrl: oauthUrl.toString(), type: 'auth_slack_login_start' });
}
