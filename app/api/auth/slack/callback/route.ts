import { NextRequest, NextResponse } from 'next/server';
import { consumeSlackOAuthState } from '@/lib/slack/auth';
import { SlackService } from '@/lib/slack/service';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { getSlackConfig } from '@/lib/slack/config';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const base = getSlackConfig().appBaseUrl ?? `${url.protocol}//${url.host}`;
  console.info('[slack-auth-callback] incoming callback', {
    hasCode: Boolean(code),
    hasState: Boolean(state),
    providerError: url.searchParams.get('error')
  });

  const providerError = url.searchParams.get('error');
  if (providerError) {
    console.error('[slack-auth-callback] provider error', { providerError });
    return NextResponse.redirect(new URL('/login?slack=auth_failed', base));
  }

  if (!code || !state || !(await consumeSlackOAuthState(state, 'login'))) {
    console.warn('[slack-auth-callback] invalid callback payload or state', {
      hasCode: Boolean(code),
      hasState: Boolean(state)
    });
    return NextResponse.redirect(new URL('/login?slack=state_invalid', base));
  }

  try {
    const oauth = await SlackService.exchangeOAuthCode(code, 'auth');
    const userToken = oauth.authed_user?.access_token;
    const openIdProfile = userToken ? await SlackService.getOpenIdUserInfo(userToken) : null;
    const slackUserId = openIdProfile?.sub ?? oauth.authed_user?.id;
    const slackTeamId = openIdProfile?.['https://slack.com/team_id'] ?? oauth.team?.id;
    const slackEmail = openIdProfile?.email ?? null;
    if (!slackUserId || !slackTeamId) throw new Error('missing_identity');
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
        slackTeamId,
        hasEmail: Boolean(slackEmail)
      });
      return NextResponse.redirect(new URL('/auth/slack/unlinked', base));
    }

    const { data: profile } = await service.from('profiles').select('email').eq('id', profileId).single<{ email: string }>();
    if (!profile?.email) throw new Error('missing_email');
    console.info('[slack-auth-callback] generating magic link', { profileId });

    await service.from('slack_identities').update({ last_login_at: new Date().toISOString() }).eq('profile_id', profileId).eq('slack_team_id', slackTeamId).eq('slack_user_id', slackUserId);

    const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
      type: 'magiclink',
      email: profile.email,
      options: { redirectTo: `${base}/missions` }
    });
    if (linkError || !linkData?.properties?.action_link) throw new Error('magic_link_failed');
    console.info('[slack-auth-callback] auth flow completed', { profileId });

    return NextResponse.redirect(linkData.properties.action_link);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    console.error('[slack-auth-callback] failure', {
      reason,
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.redirect(new URL('/login?slack=auth_failed', base));
  }
}
