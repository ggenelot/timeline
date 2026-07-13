import { NextRequest, NextResponse } from 'next/server';
import { SlackService, pickSlackAvatarUrl } from '@/lib/slack/service';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { getSlackConfig } from '@/lib/slack/config';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const config = getSlackConfig();
  const appBaseUrl = config.appBaseUrl ?? `${url.protocol}//${url.host}`;
  const redirectTarget = new URL('/profile', appBaseUrl);
  const endpointAuthorize = 'https://slack.com/oauth/v2/authorize';
  const endpointToken = 'https://slack.com/api/oauth.v2.access';
  const scopesRequested = ['chat:write', 'channels:manage', 'groups:write', 'groups:read', 'im:write', 'users:read'];

  if (!code || !state) {
    redirectTarget.searchParams.set('slack', 'error');
    return NextResponse.redirect(redirectTarget);
  }

  const serviceClient = createServerSupabaseServiceClient();
  const { data: stateRow, error: stateError } = await serviceClient
    .from('slack_oauth_states')
    .select('id,profile_id,expires_at,consumed_at')
    .eq('state', state)
    .maybeSingle<{ id: string; profile_id: string; expires_at: string; consumed_at: string | null }>();

  if (stateError || !stateRow || stateRow.consumed_at || new Date(stateRow.expires_at) < new Date()) {
    redirectTarget.searchParams.set('slack', 'expired');
    return NextResponse.redirect(redirectTarget);
  }

  try {
    const oauth = await SlackService.exchangeOAuthCode(code);
    const slackUserId = oauth.authed_user?.id;
    const slackTeamId = oauth.team?.id;
    const slack = new SlackService();

    if (!slackUserId || !slackTeamId) {
      throw new Error('Slack OAuth n\'a pas renvoyé les identifiants utilisateur/équipe.');
    }

    if (config.teamId && slackTeamId !== config.teamId) {
      throw new Error('Slack workspace non autorisé.');
    }

    let slackUsername: string | null = null;
    let avatarUrl: string | null = null;
    try {
      const userInfo = await slack.getUserInfo(slackUserId, oauth.authed_user?.access_token);
      slackUsername = userInfo.user?.name ?? null;
      avatarUrl = pickSlackAvatarUrl(userInfo.user?.profile);
    } catch (error) {
      console.warn('[slack/connect/callback] users.info failed, continuing without slack username', {
        state,
        profileId: stateRow.profile_id,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    const { error: profileError } = await serviceClient
      .from('profiles')
      .update({
        slack_user_id: slackUserId,
        slack_team_id: slackTeamId,
        slack_username: slackUsername,
        slack_connected_at: new Date().toISOString(),
        ...(avatarUrl ? { avatar_url: avatarUrl } : {})
      })
      .eq('id', stateRow.profile_id);

    if (profileError) {
      throw new Error(profileError.message);
    }

    // Miroir dans slack_identities : c'est la source de vérité utilisée par le renvoi des
    // identifiants (send-slack-invitations) et la connexion via Slack. Sans cette ligne, un
    // compte associé en self-service serait vu comme « non lié » et un renvoi tenterait de
    // recréer un profil, violant idx_profiles_slack_team_user_unique.
    await serviceClient.from('slack_identities').upsert(
      {
        profile_id: stateRow.profile_id,
        slack_team_id: slackTeamId,
        slack_user_id: slackUserId,
        is_primary: true,
        last_login_at: new Date().toISOString()
      },
      { onConflict: 'slack_team_id,slack_user_id' }
    );

    await serviceClient.from('slack_oauth_states').update({ consumed_at: new Date().toISOString() }).eq('id', stateRow.id);

    redirectTarget.searchParams.set('slack', 'connected');
    return NextResponse.redirect(redirectTarget);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue.';
    console.error('[slack/connect/callback] OAuth failed', {
      flow: 'bot_install',
      endpoint_authorize: endpointAuthorize,
      endpoint_token: endpointToken,
      scopes_requested: scopesRequested,
      redirect_uri: config.redirectUri ?? null,
      state,
      profileId: stateRow.profile_id,
      message,
      details: error instanceof Error && 'details' in error ? (error as Error & { details?: unknown }).details : undefined
    });

    redirectTarget.searchParams.set('slack', 'error');
    redirectTarget.searchParams.set('slack_reason', message);
    return NextResponse.redirect(redirectTarget);
  }
}
