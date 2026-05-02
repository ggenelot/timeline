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
    console.warn('[slack-magic] no linked Timeline identity for Slack account', {
      slackTeamId: challenge.slack_team_id
    });
    return NextResponse.redirect(new URL('/auth/slack/unlinked', base));
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
