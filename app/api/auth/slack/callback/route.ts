import { NextRequest, NextResponse } from 'next/server';
import { consumeSlackOAuthState } from '@/lib/slack/auth';
import { SlackService } from '@/lib/slack/service';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { getSlackConfig } from '@/lib/slack/config';

type SlackAuthErrorCode =
  | 'slack_provider_error'
  | 'missing_code_or_state'
  | 'invalid_or_expired_state'
  | 'openid_token_exchange_failed'
  | 'openid_userinfo_failed'
  | 'missing_slack_identity'
  | 'workspace_not_allowed'
  | 'identity_not_linked'
  | 'missing_profile_email'
  | 'magic_link_failed';

const buildAuthFailedRedirect = (base: string, reason: SlackAuthErrorCode) =>
  NextResponse.redirect(new URL(`/login?slack=auth_failed&reason=${reason}`, base));

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const base = getSlackConfig().appBaseUrl ?? `${url.protocol}//${url.host}`;
  const endpointAuthorize = 'https://slack.com/openid/connect/authorize';
  const tokenExchangeEndpoint = 'https://slack.com/api/openid.connect.token';
  const scopesRequested = ['openid', 'profile'];
  const redirectUri = `${base}/api/auth/slack/callback`;
  console.info('[slack-auth-callback] incoming callback', {
    flow: 'slack_login',
    endpoint_authorize: endpointAuthorize,
    token_exchange_endpoint: tokenExchangeEndpoint,
    scopes_requested: scopesRequested,
    redirect_uri: redirectUri,
    hasCode: Boolean(code),
    hasState: Boolean(state),
    providerError: url.searchParams.get('error')
  });

  const providerError = url.searchParams.get('error');
  if (providerError) {
    console.error('[slack-auth-callback] provider error', { code: 'slack_provider_error', providerError });
    return buildAuthFailedRedirect(base, 'slack_provider_error');
  }

  if (!code || !state) {
    console.warn('[slack-auth-callback] invalid callback payload or state', {
      code: 'missing_code_or_state',
      hasCode: Boolean(code),
      hasState: Boolean(state)
    });
    return buildAuthFailedRedirect(base, 'missing_code_or_state');
  }

  console.info('[slack-auth-callback] received state from Slack', {
    flow: 'slack_login',
    step: 'callback_received',
    state
  });

  const stateConsumed = await consumeSlackOAuthState(state, 'login');
  if (stateConsumed.status === 'not_found' || stateConsumed.status === 'expired' || stateConsumed.status === 'intent_mismatch') {
    console.warn('[slack-auth-callback] state rejected', {
      code: 'invalid_or_expired_state',
      reason: stateConsumed.reason,
      slack_state: state,
      db_state: stateConsumed.row ? state : null,
      db_expires_at: stateConsumed.row?.expires_at ?? null,
      db_consumed_at: stateConsumed.row?.consumed_at ?? null
    });
    return buildAuthFailedRedirect(base, 'invalid_or_expired_state');
  }

  if (stateConsumed.status === 'already_used') {
    console.info('[slack-auth-callback] duplicate callback detected; soft success', {
      flow: 'slack_login',
      step: 'consume_state',
      slack_state: state,
      db_state: state,
      status: 'already_used',
      expires_at: stateConsumed.row?.expires_at ?? null,
      consumed_at: stateConsumed.row?.consumed_at ?? null
    });
    return NextResponse.redirect(new URL('/login?slack=already_processed', base));
  }

  console.info('[slack-auth-callback] state consumed', {
    flow: 'slack_login',
    slack_state: state,
    db_state: stateConsumed.row?.id ?? null,
    db_expires_at: stateConsumed.row?.expires_at ?? null,
    db_consumed_at: stateConsumed.row?.consumed_at ?? null
  });

  try {
    let openIdToken: Awaited<ReturnType<typeof SlackService.exchangeOpenIdCode>>;
    try {
      openIdToken = await SlackService.exchangeOpenIdCode(code);
    } catch (error) {
      console.error('[slack-auth-callback] OpenID token exchange failed', {
        code: 'openid_token_exchange_failed',
        details: error instanceof Error && 'details' in error ? (error as Error & { details?: unknown }).details : undefined
      });
      throw new Error('openid_token_exchange_failed');
    }
    const userToken = openIdToken.access_token;
    if (!userToken) {
      throw new Error('openid_token_exchange_failed');
    }
    console.info('[slack-auth-callback] OpenID token obtained', { hasAccessToken: Boolean(userToken), tokenType: openIdToken.token_type });

    let openIdProfile: Awaited<ReturnType<typeof SlackService.getOpenIdUserInfo>> | null = null;
    let idTokenPayload: Record<string, unknown> | null = null;
    if (openIdToken.id_token) {
      try {
        const payloadB64 = openIdToken.id_token.split('.')[1];
        if (payloadB64) {
          idTokenPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as Record<string, unknown>;
        }
      } catch {
        idTokenPayload = null;
      }
    }
    try {
      openIdProfile = await SlackService.getOpenIdUserInfo(userToken);
      console.info('[slack-auth-callback] OpenID userInfo obtained');
    } catch (error) {
      console.error('[slack-auth-callback] OpenID userInfo failed', { code: 'openid_userinfo_failed' });
      throw new Error('openid_userinfo_failed');
    }

    const slackUserId = openIdProfile?.sub ?? (typeof idTokenPayload?.sub === 'string' ? idTokenPayload.sub : undefined);
    const slackTeamId = openIdProfile?.['https://slack.com/team_id'] ?? (typeof idTokenPayload?.['https://slack.com/team_id'] === 'string' ? idTokenPayload['https://slack.com/team_id'] : undefined);
    const slackEmail = openIdProfile?.email ?? null;
    if (!slackUserId || !slackTeamId) throw new Error('missing_slack_identity');
    const config = getSlackConfig();
    if (config.teamId && slackTeamId !== config.teamId) throw new Error('workspace_not_allowed');
    console.info('[slack-auth-callback] resolved Slack identity', {
      slackTeamId,
      slackUserId,
      hasEmail: Boolean(slackEmail)
    });

    const service = createServerSupabaseServiceClient();
    const { data: identity } = await service
      .from('slack_identities')
      .select('profile_id')
      .eq('slack_team_id', slackTeamId)
      .eq('slack_user_id', slackUserId)
      .maybeSingle<{ profile_id: string | null }>();

    let profileId = identity?.profile_id ?? null;

    if (!profileId) {
      console.info('[slack-auth-callback] no identity mapping found, trying legacy profile fields');
      const { data: legacyProfile } = await service
        .from('profiles')
        .select('id')
        .eq('slack_team_id', slackTeamId)
        .eq('slack_user_id', slackUserId)
        .maybeSingle<{ id: string }>();
      if (legacyProfile?.id) {
        profileId = legacyProfile.id;
        console.info('[slack-auth-callback] linked from legacy profile mapping', { profileId });
        await service.from('slack_identities').upsert({
          profile_id: profileId,
          slack_team_id: slackTeamId,
          slack_user_id: slackUserId,
          is_primary: true,
          last_login_at: new Date().toISOString()
        });
      }
    }

    if (!profileId) {
      console.warn('[slack-auth-callback] no linked Timeline identity for Slack account', {
        code: 'identity_not_linked',
        slackTeamId,
        hasEmail: Boolean(slackEmail)
      });
      return buildAuthFailedRedirect(base, 'identity_not_linked');
    }
    console.info('[slack-auth-callback] Timeline mapping found', { profileId });

    const { data: profile } = await service.from('profiles').select('email').eq('id', profileId).single<{ email: string }>();
    if (!profile?.email) throw new Error('missing_profile_email');
    console.info('[slack-auth-callback] generating magic link', { profileId });

    await service.from('slack_identities').update({ last_login_at: new Date().toISOString() }).eq('profile_id', profileId).eq('slack_team_id', slackTeamId).eq('slack_user_id', slackUserId);

    const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
      type: 'magiclink',
      email: profile.email,
      options: { redirectTo: `${base}/missions` }
    });
    if (linkError || !linkData?.properties?.action_link) throw new Error('magic_link_failed');
    console.info('[slack-auth-callback] magic link generated');
    console.info('[slack-auth-callback] auth flow completed', { profileId });

    return NextResponse.redirect(linkData.properties.action_link);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown_error';
    const safeReason: SlackAuthErrorCode =
      reason === 'openid_token_exchange_failed' ||
      reason === 'openid_userinfo_failed' ||
      reason === 'missing_slack_identity' ||
      reason === 'workspace_not_allowed' ||
      reason === 'identity_not_linked' ||
      reason === 'missing_profile_email' ||
      reason === 'magic_link_failed'
        ? reason
        : 'slack_provider_error';
    console.error('[slack-auth-callback] failure', {
      flow: 'slack_login',
      endpoint_authorize: endpointAuthorize,
      token_exchange_endpoint: tokenExchangeEndpoint,
      scopes_requested: scopesRequested,
      redirect_uri: redirectUri,
      callback_error: safeReason,
      details: error instanceof Error && 'details' in error ? (error as Error & { details?: unknown }).details : undefined
    });
    return buildAuthFailedRedirect(base, safeReason);
  }
}
