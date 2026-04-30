import { NextRequest, NextResponse } from 'next/server';
import { consumeSlackLoginChallenge } from '@/lib/slack/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { getSlackConfig } from '@/lib/slack/config';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const base = getSlackConfig().appBaseUrl ?? `${url.protocol}//${url.host}`;
  if (!token) return NextResponse.redirect(new URL('/login?slack=magic_invalid', base));

  const challenge = await consumeSlackLoginChallenge(token);
  if (!challenge) return NextResponse.redirect(new URL('/login?slack=magic_invalid', base));

  const service = createServerSupabaseServiceClient();
  const { data: identity } = await service.from('slack_identities').select('profile_id').eq('slack_team_id', challenge.slack_team_id).eq('slack_user_id', challenge.slack_user_id).maybeSingle<{ profile_id: string | null }>();
  let profileId = identity?.profile_id ?? null;
  if (!profileId) {
    const syntheticEmail = `slack_${challenge.slack_team_id}_${challenge.slack_user_id}@timeline.slack.local`;
    const { data: createdUser, error } = await service.auth.admin.createUser({
      email: syntheticEmail,
      email_confirm: true,
      user_metadata: { full_name: `Slack ${challenge.slack_user_id}` }
    });
    if (error || !createdUser.user?.id) return NextResponse.redirect(new URL('/login?slack=magic_invalid', base));
    profileId = createdUser.user.id;
    await service.from('slack_identities').insert({
      profile_id: profileId,
      slack_team_id: challenge.slack_team_id,
      slack_user_id: challenge.slack_user_id,
      is_primary: true,
      last_login_at: new Date().toISOString()
    });
  }

  const { data: profile } = await service.from('profiles').select('email').eq('id', profileId).single<{ email: string }>();
  if (!profile?.email) return NextResponse.redirect(new URL('/login?slack=magic_invalid', base));

  const { data: linkData } = await service.auth.admin.generateLink({ type: 'magiclink', email: profile.email, options: { redirectTo: `${base}/missions` } });
  return NextResponse.redirect(linkData?.properties?.action_link ?? new URL('/login?slack=magic_invalid', base));
}
