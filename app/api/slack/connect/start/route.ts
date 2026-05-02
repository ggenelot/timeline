import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { getSlackConfig } from '@/lib/slack/config';

const SCOPES = ['chat:write', 'channels:manage', 'groups:write', 'groups:read', 'im:write'];
const USER_SCOPES = ['users:read'];
const AUTHORIZE_ENDPOINT = 'https://slack.com/oauth/v2/authorize';

export async function POST(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 401 });
  }

  const config = getSlackConfig();
  if (!config.clientId) {
    return NextResponse.json({ error: 'Configuration Slack OAuth incomplète.' }, { status: 500 });
  }

  const state = randomUUID();
  const serviceClient = createServerSupabaseServiceClient();

  const { error } = await serviceClient.from('slack_oauth_states').insert({
    state,
    profile_id: auth.profile.id,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  });

  if (error) {
    return NextResponse.json({ error: `Impossible de préparer la connexion Slack: ${error.message}` }, { status: 500 });
  }

  const requestedScopes = [...SCOPES, ...USER_SCOPES];
  const hasOpenIdScopes = requestedScopes.some((scope) => ['openid', 'profile', 'email'].includes(scope));
  if (hasOpenIdScopes) {
    console.error('[slack/connect/start] invalid mixed scopes', {
      flow: 'bot_install',
      endpoint_authorize: AUTHORIZE_ENDPOINT,
      scopes_requested: requestedScopes
    });
    return NextResponse.json({ error: 'Scopes Slack invalides: mélange OpenID + bot interdit.' }, { status: 500 });
  }

  const oauthUrl = new URL(AUTHORIZE_ENDPOINT);
  oauthUrl.searchParams.set('client_id', config.clientId);
  oauthUrl.searchParams.set('scope', SCOPES.join(','));
  oauthUrl.searchParams.set('user_scope', USER_SCOPES.join(','));
  oauthUrl.searchParams.set('state', state);
  if (config.teamId) {
    oauthUrl.searchParams.set('team', config.teamId);
  }

  if (config.redirectUri) {
    oauthUrl.searchParams.set('redirect_uri', config.redirectUri);
  }

  console.info('[slack/connect/start] generated oauth URL', {
    flow: 'bot_install',
    endpoint_authorize: AUTHORIZE_ENDPOINT,
    scopes_requested: requestedScopes,
    redirect_uri: config.redirectUri ?? null
  });

  return NextResponse.json({ oauthUrl: oauthUrl.toString() });
}
