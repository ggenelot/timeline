import { NextRequest, NextResponse } from 'next/server';
import { consumeSlackLoginChallenge, resolveProfileBySlack } from '@/lib/slack/auth';
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

  // Résolution du profil : slack_identities puis repli sur profiles.slack_user_id (via
  // resolveProfileBySlack), pour couvrir les comptes reliés sans ligne slack_identities — cohérent
  // avec l'edge function d'onboarding et l'endpoint Events. Sans ce repli, ces comptes tombaient à
  // tort sur /auth/slack/unlinked.
  const resolved = await resolveProfileBySlack(challenge.slack_team_id, challenge.slack_user_id);
  if (!resolved) {
    console.warn('[slack-magic] no linked Timeline identity for Slack account', {
      slackTeamId: challenge.slack_team_id
    });
    return NextResponse.redirect(new URL('/auth/slack/unlinked', base));
  }

  if (!resolved.email) {
    console.error('[slack-magic] missing profile email for magic link', { profileId: resolved.profileId });
    return NextResponse.redirect(new URL('/login?slack=magic_invalid', base));
  }

  const service = createServerSupabaseServiceClient();
  const { data: linkData } = await service.auth.admin.generateLink({ type: 'magiclink', email: resolved.email, options: { redirectTo: `${base}/missions` } });
  console.info('[slack-magic] generated magic link', { profileId: resolved.profileId });
  return NextResponse.redirect(linkData?.properties?.action_link ?? new URL('/login?slack=magic_invalid', base));
}
