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

  // Slack (et les autres messageries) pré-chargent les URLs pour en générer un aperçu. Ce GET
  // « robot » consommerait le jeton usage-unique AVANT le clic humain, rendant le lien invalide
  // (observé : Slackbot consomme le jeton ~1,5 s après émission). On renvoie donc une page neutre,
  // sans rien consommer, pour ces robots d'aperçu : seul un vrai navigateur déclenche la connexion.
  const userAgent = request.headers.get('user-agent') ?? '';
  const isLinkPreviewBot =
    /slackbot|link-?expanding|facebookexternalhit|twitterbot|linkedinbot|whatsapp|discordbot|telegrambot|embedly|bot\b|crawler|spider|preview/i.test(
      userAgent
    );
  if (isLinkPreviewBot) {
    console.info('[slack-magic] skipping consumption for link-preview bot', { userAgent: userAgent.slice(0, 120) });
    return new NextResponse(
      '<!doctype html><meta charset="utf-8"><title>Connexion Timeline</title><p>Ouvre ce lien dans ton navigateur pour te connecter à Timeline.</p>',
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
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
