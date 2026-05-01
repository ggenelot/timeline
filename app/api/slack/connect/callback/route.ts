import { NextRequest, NextResponse } from 'next/server';
import { SlackService } from '@/lib/slack/service';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { getSlackConfig } from '@/lib/slack/config';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const config = getSlackConfig();
  const appBaseUrl = config.appBaseUrl ?? `${url.protocol}//${url.host}`;
  const redirectTarget = new URL('/profile', appBaseUrl);

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

    if (!slackUserId || !slackTeamId) {
      throw new Error('Slack OAuth n\'a pas renvoyé les identifiants utilisateur/équipe.');
    }

    if (config.teamId && slackTeamId !== config.teamId) {
      throw new Error('Slack workspace non autorisé.');
    }

    let slackUsername: string | null = null;
    try {
      const slack = new SlackService();
      const userInfo = await slack.getUserInfo(slackUserId);
      slackUsername = userInfo.user?.name ?? null;
    } catch (error) {
      console.warn('[slack-connect-callback] unable to fetch Slack username, continuing without it', {
        reason: error instanceof Error ? error.message : 'unknown'
      });
    }

    const { error: profileError } = await serviceClient
      .from('profiles')
      .update({
        slack_user_id: slackUserId,
        slack_team_id: slackTeamId,
        slack_username: slackUsername,
        slack_connected_at: new Date().toISOString()
      })
      .eq('id', stateRow.profile_id);

    if (profileError) {
      throw new Error(profileError.message);
    }

    await serviceClient.from('slack_oauth_states').update({ consumed_at: new Date().toISOString() }).eq('id', stateRow.id);

    redirectTarget.searchParams.set('slack', 'connected');
    return NextResponse.redirect(redirectTarget);
  } catch (error) {
    console.error('[slack-connect-callback] failure', {
      reason: error instanceof Error ? error.message : 'unknown'
    });
    redirectTarget.searchParams.set('slack', 'error');
    return NextResponse.redirect(redirectTarget);
  }
}
