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

  if (!code || !state || !(await consumeSlackOAuthState(state, 'login'))) {
    return NextResponse.redirect(new URL('/login?slack=state_invalid', base));
  }

  try {
    const oauth = await SlackService.exchangeOAuthCode(code, 'auth');
    const slackUserId = oauth.authed_user?.id;
    const slackTeamId = oauth.team?.id;
    if (!slackUserId || !slackTeamId) throw new Error('missing_identity');

    const service = createServerSupabaseServiceClient();
    const { data: identity } = await service
      .from('slack_identities')
      .select('profile_id')
      .eq('slack_team_id', slackTeamId)
      .eq('slack_user_id', slackUserId)
      .maybeSingle<{ profile_id: string | null }>();

    let profileId = identity?.profile_id ?? null;

    if (!profileId) {
      const syntheticEmail = `slack_${slackTeamId}_${slackUserId}@timeline.slack.local`;
      const { data: createdUser, error: createUserError } = await service.auth.admin.createUser({
        email: syntheticEmail,
        email_confirm: true,
        user_metadata: { full_name: `Slack ${slackUserId}` }
      });

      if (createUserError || !createdUser.user?.id) {
        throw new Error('user_create_failed');
      }

      profileId = createdUser.user.id;
      await service.from('slack_identities').insert({
        profile_id: profileId,
        slack_team_id: slackTeamId,
        slack_user_id: slackUserId,
        is_primary: true,
        last_login_at: new Date().toISOString()
      });
    }

    const { data: profile } = await service.from('profiles').select('email').eq('id', profileId).single<{ email: string }>();
    if (!profile?.email) throw new Error('missing_email');

    await service.from('slack_identities').update({ last_login_at: new Date().toISOString() }).eq('profile_id', profileId).eq('slack_team_id', slackTeamId).eq('slack_user_id', slackUserId);

    const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
      type: 'magiclink',
      email: profile.email,
      options: { redirectTo: `${base}/missions` }
    });
    if (linkError || !linkData?.properties?.action_link) throw new Error('magic_link_failed');

    return NextResponse.redirect(linkData.properties.action_link);
  } catch {
    return NextResponse.redirect(new URL('/login?slack=auth_failed', base));
  }
}
