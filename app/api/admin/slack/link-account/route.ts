import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

type LinkAccountPayload = {
  slack_user_id?: string;
  slack_team_id?: string;
  slack_name?: string;
  slack_email?: string | null;
  profile_id?: string;
  identifier?: string;
};

function randomPassword(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

export async function POST(request: NextRequest) {
  const token = getBearerToken(request);
  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse) return auth.errorResponse;
  if (auth.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Accès réservé aux administrateurs.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as LinkAccountPayload;
  const slackUserId = body.slack_user_id?.trim();
  const slackTeamId = body.slack_team_id?.trim();
  if (!slackUserId || !slackTeamId) {
    return NextResponse.json({ error: 'slack_user_id et slack_team_id sont obligatoires.' }, { status: 400 });
  }

  const service = createServerSupabaseServiceClient();

  const { data: existingIdentity } = await service
    .from('slack_identities')
    .select('profile_id')
    .eq('slack_team_id', slackTeamId)
    .eq('slack_user_id', slackUserId)
    .maybeSingle();
  if (existingIdentity?.profile_id) {
    return NextResponse.json({ error: 'Ce compte Slack est déjà lié à un profil Timeline.' }, { status: 409 });
  }

  let profileId: string;
  let email: string;

  if (body.profile_id) {
    profileId = body.profile_id;
    const { data: existingProfile, error: profileError } = await service
      .from('profiles')
      .select('id,email')
      .eq('id', profileId)
      .single();
    if (profileError || !existingProfile) {
      return NextResponse.json({ error: 'Profil Timeline introuvable.' }, { status: 404 });
    }
    email = existingProfile.email;

    const { error: updateError } = await service
      .from('profiles')
      .update({ slack_user_id: slackUserId, slack_team_id: slackTeamId, slack_connected_at: new Date().toISOString() })
      .eq('id', profileId);
    if (updateError) {
      return NextResponse.json({ error: `Impossible de lier le profil : ${updateError.message}` }, { status: 500 });
    }
  } else {
    const identifier = body.identifier?.trim().toLowerCase() ?? '';
    const fullName = body.slack_name?.trim() ?? '';
    if (!identifier) {
      return NextResponse.json({ error: 'Un identifiant est obligatoire pour créer le compte.' }, { status: 400 });
    }
    if (!/^[a-z0-9._-]+$/.test(identifier)) {
      return NextResponse.json({ error: "L'identifiant ne peut contenir que des lettres minuscules, chiffres, points, tirets et underscores." }, { status: 400 });
    }
    if (!fullName) {
      return NextResponse.json({ error: 'Le nom est obligatoire.' }, { status: 400 });
    }

    email = body.slack_email?.trim().toLowerCase() || `${identifier}@timeline.local`;

    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      email_confirm: true,
      password: randomPassword(),
      user_metadata: { full_name: fullName }
    });
    if (createError || !created.user?.id) {
      const isDuplicate = createError?.message?.toLowerCase().includes('already');
      return NextResponse.json({ error: isDuplicate ? 'Un utilisateur avec cet email ou identifiant existe déjà.' : (createError?.message ?? 'Création impossible.') }, { status: 400 });
    }
    profileId = created.user.id;

    const { error: profileError } = await service.from('profiles').upsert(
      {
        id: profileId,
        full_name: fullName,
        email,
        identifier,
        role: 'benevole',
        slack_user_id: slackUserId,
        slack_team_id: slackTeamId,
        slack_connected_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    );
    if (profileError) {
      return NextResponse.json({ error: `Compte créé mais profil incomplet : ${profileError.message}` }, { status: 500 });
    }
  }

  await service.from('slack_identities').upsert(
    { profile_id: profileId, slack_team_id: slackTeamId, slack_user_id: slackUserId, is_primary: true, last_login_at: new Date().toISOString() },
    { onConflict: 'slack_team_id,slack_user_id' }
  );

  await service
    .from('slack_invitations')
    .update({ status: 'accepted', accepted_at: new Date().toISOString(), matched_profile_id: profileId })
    .eq('slack_team_id', slackTeamId)
    .eq('slack_user_id', slackUserId);

  const { data: linkData } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${new URL(request.url).origin}/missions` }
  });

  return NextResponse.json({
    message: 'Compte Timeline lié au compte Slack.',
    profile_id: profileId,
    magic_link: linkData?.properties?.action_link ?? null
  });
}
