import { NextResponse } from 'next/server';
import { createSlackOAuthState } from '@/lib/slack/auth';
import { getSlackAuthRedirectUri, getSlackConfig } from '@/lib/slack/config';

const OIDC_SCOPES = ['openid', 'profile'];
const OIDC_AUTHORIZE_URL = 'https://slack.com/openid/connect/authorize';

function assertSlackOidcAuthorizeUrl(oauthUrl: URL) {
  const serialized = oauthUrl.toString();
  if (!oauthUrl.pathname.includes('/openid/connect/authorize')) {
    throw new Error('Invalid Slack OpenID authorize pathname.');
  }
  if (oauthUrl.pathname.includes('/oauth') || serialized.includes('user_scope=') || serialized.includes('openid_connect=1')) {
    throw new Error('Invalid Slack OpenID authorize parameters.');
  }
}

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

  const redirectUri = getSlackAuthRedirectUri();
  if (!redirectUri) {
    console.error('[slack-auth-start] missing Slack auth redirect URI and APP_BASE_URL');
    return NextResponse.json({ error: 'SLACK_AUTH_REDIRECT_URI (ou APP_BASE_URL) manquant.' }, { status: 500 });
  }

  const state = await createSlackOAuthState(null, 'login');
  const oauthUrl = new URL(OIDC_AUTHORIZE_URL);
  oauthUrl.searchParams.set('client_id', config.clientId);
  oauthUrl.searchParams.set('scope', OIDC_SCOPES.join(' '));
  oauthUrl.searchParams.set('response_type', 'code');
  oauthUrl.searchParams.set('state', state);
  oauthUrl.searchParams.set('redirect_uri', redirectUri);
  const teamParamPresent = Boolean(config.teamId);
  const teamParamValid = Boolean(config.teamId && config.teamId.startsWith('T'));
  if (teamParamValid && config.teamId) {
    oauthUrl.searchParams.set('team', config.teamId);
  }

  assertSlackOidcAuthorizeUrl(oauthUrl);

  console.info('[slack-auth-start] generated oauth URL', {
    initial_authorize_url_origin: oauthUrl.origin,
    initial_authorize_url_pathname: oauthUrl.pathname,
    requested_scope: oauthUrl.searchParams.get('scope'),
    team_param_present: teamParamPresent,
    team_param_valid: teamParamValid,
    redirect_uri: oauthUrl.searchParams.get('redirect_uri')
  });

  return NextResponse.json({ oauthUrl: oauthUrl.toString(), type: 'auth_slack_login_start' });
}
