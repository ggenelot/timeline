import { NextRequest, NextResponse } from 'next/server';
import { consumeSlackLoginChallenge } from '@/lib/slack/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { getSlackConfig } from '@/lib/slack/config';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const base = getSlackConfig().appBaseUrl ?? `${url.protocol}//${url.host}`;
  console.info('[slack-magic] incoming magic login request', { hasToken: Boolean(token) });
  if (!token) {
    console.warn('[slack-magic] missing token');
    return NextResponse.redirect(new URL('/login?slack=magic_invalid', base));
  }

  const challenge = await consumeSlackLoginChallenge(token);
  if (!challenge) {
    console.warn('[slack-magic] invalid or expired login challenge');
    return NextResponse.redirect(new URL('/login?slack=magic_invalid', base));
  }
  console.info('[slack-magic] challenge consumed', {
    slackTeamId: challenge.slack_team_id,
    slackUserId: challenge.slack_user_id
  });

  const service = createServerSupabaseServiceClient();
  const { data: identity } = await service.from('slack_identities').select('profile_id').eq('slack_team_id', challenge.slack_team_id).eq('slack_user_id', challenge.slack_user_id).maybeSingle<{ profile_id: string | null }>();
  let profileId = identity?.profile_id ?? null;
  if (!profileId) {
    console.warn('[slack-magic] no identity mapping, creating synthetic user');
    const syntheticEmail = `slack_${challenge.slack_team_id}_${challenge.slack_user_id}@timeline.slack.local`;
    const { data: createdUser, error } = await service.auth.admin.createUser({
      email: syntheticEmail,
      email_confirm: true,
      user_metadata: { full_name: `Slack ${challenge.slack_user_id}` }
    });
    if (error || !createdUser.user?.id) {
      console.error('[slack-magic] failed to create synthetic user', { error: error?.message });
      return NextResponse.redirect(new URL('/login?slack=magic_invalid', base));
    }
    profileId = createdUser.user.id;
    console.info('[slack-magic] synthetic user created', { profileId });
    await service.from('slack_identities').insert({
      profile_id: profileId,
      slack_team_id: challenge.slack_team_id,
      slack_user_id: challenge.slack_user_id,
      is_primary: true,
      last_login_at: new Date().toISOString()
    });
  }

  const { data: profile } = await service.from('profiles').select('email').eq('id', profileId).single<{ email: string }>();
  if (!profile?.email) {
    console.error('[slack-magic] missing profile email for magic link', { profileId });
    return NextResponse.redirect(new URL('/login?slack=magic_invalid', base));
  }

  const { data: linkData } = await service.auth.admin.generateLink({ type: 'magiclink', email: profile.email, options: { redirectTo: `${base}/missions` } });
  console.info('[slack-magic] generated magic link', { profileId });
  return NextResponse.redirect(linkData?.properties?.action_link ?? new URL('/login?slack=magic_invalid', base));
}
