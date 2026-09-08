import { NextResponse } from 'next/server';
import { consumeSlackOnboardingChallenge } from '@/lib/slack/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

// Association self-service : le visiteur (identifié par son jeton d'onboarding) réclame un compte
// Timeline existant non relié à un compte Slack. On revérifie côté serveur que le compte est bien
// non relié (le jeton ne doit jamais permettre de détourner un compte déjà rattaché), puis on lie
// l'identité Slack et on renvoie de quoi ouvrir la session.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string; profile_id?: string };
  const token = body.token?.trim();
  const profileId = body.profile_id?.trim();
  if (!token || !profileId) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });

  const service = createServerSupabaseServiceClient();

  // On valide le compte cible AVANT de consommer le jeton.
  const { data: profile } = await service
    .from('profiles')
    .select('id, email, slack_user_id')
    .eq('id', profileId)
    .maybeSingle<{ id: string; email: string | null; slack_user_id: string | null }>();
  if (!profile) return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 });
  if (profile.slack_user_id) return NextResponse.json({ error: 'Ce compte est déjà relié à un compte Slack.' }, { status: 409 });
  if (!profile.email) return NextResponse.json({ error: 'Ce compte n’a pas d’email, connexion impossible.' }, { status: 400 });

  const ctx = await consumeSlackOnboardingChallenge(token);
  if (!ctx) return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 400 });

  // Le couple Slack ne doit pas déjà être rattaché à un autre profil.
  const { data: existingIdentity } = await service
    .from('slack_identities')
    .select('profile_id')
    .eq('slack_team_id', ctx.slackTeamId)
    .eq('slack_user_id', ctx.slackUserId)
    .maybeSingle<{ profile_id: string | null }>();
  if (existingIdentity?.profile_id) {
    return NextResponse.json({ error: 'Ce compte Slack est déjà relié à un profil Timeline.' }, { status: 409 });
  }

  await service
    .from('profiles')
    .update({ slack_user_id: ctx.slackUserId, slack_team_id: ctx.slackTeamId, slack_connected_at: new Date().toISOString() })
    .eq('id', profileId);

  await service.from('slack_identities').upsert(
    { profile_id: profileId, slack_team_id: ctx.slackTeamId, slack_user_id: ctx.slackUserId, is_primary: true, last_login_at: new Date().toISOString() },
    { onConflict: 'slack_team_id,slack_user_id' }
  );

  const { data: linkData } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: profile.email,
    options: { redirectTo: `${new URL(request.url).origin}/missions` }
  });

  return NextResponse.json({
    ok: true,
    token_hash: linkData?.properties?.hashed_token ?? null,
    action_link: linkData?.properties?.action_link ?? null
  });
}
