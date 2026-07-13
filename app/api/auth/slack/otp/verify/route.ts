import { NextResponse } from 'next/server';
import { resolveSlackTargetByIdentifier, verifySlackNumericLoginChallenge } from '@/lib/slack/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

const GENERIC_ERROR = 'Code invalide ou expiré.';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { identifier?: string; code?: string };
  const identifier = body.identifier?.trim();
  const code = body.code?.replace(/\s+/g, '');
  if (!identifier || !code) return NextResponse.json({ error: 'Identifiant et code requis.' }, { status: 400 });

  const target = await resolveSlackTargetByIdentifier(identifier);
  if (!target) return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });

  const result = await verifySlackNumericLoginChallenge({
    slackTeamId: target.slackTeamId,
    slackUserId: target.slackUserId,
    code
  });

  if (result.status === 'locked') {
    return NextResponse.json({ error: 'Trop de tentatives. Demandez un nouveau code.' }, { status: 429 });
  }
  if (result.status !== 'ok') {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const service = createServerSupabaseServiceClient();

  // Profil cible : priorité au lien slack_identities (source de vérité de l'auth), sinon le
  // profil résolu par l'identifiant. On a besoin de l'email pour générer le lien de session.
  const { data: identity } = await service
    .from('slack_identities')
    .select('profile_id')
    .eq('slack_team_id', target.slackTeamId)
    .eq('slack_user_id', target.slackUserId)
    .maybeSingle<{ profile_id: string | null }>();

  let email = target.email;
  if (identity?.profile_id && identity.profile_id !== target.profileId) {
    const { data: profile } = await service
      .from('profiles')
      .select('email')
      .eq('id', identity.profile_id)
      .maybeSingle<{ email: string | null }>();
    email = profile?.email ?? email;
  }

  if (!email) return NextResponse.json({ error: 'Email introuvable.' }, { status: 400 });

  const { data: linkData } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${new URL(request.url).origin}/missions` }
  });

  // Le client établit la session en place via verifyOtp(token_hash) ; action_link sert de repli.
  return NextResponse.json({
    ok: true,
    token_hash: linkData?.properties?.hashed_token ?? null,
    action_link: linkData?.properties?.action_link ?? null,
    next: '/missions'
  });
}
