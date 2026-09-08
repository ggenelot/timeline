import { NextResponse } from 'next/server';
import { consumeSlackOnboardingChallenge } from '@/lib/slack/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

const DIACRITICS_RE = /[̀-ͯ]/g;

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

async function deriveUniqueIdentifier(
  service: ReturnType<typeof createServerSupabaseServiceClient>,
  fullName: string,
  fallback: string
): Promise<string> {
  const base = slugify(fullName) || slugify(fallback) || 'benevole';
  let candidate = base;
  let attempt = 1;
  for (;;) {
    const { data: existing } = await service.from('profiles').select('id').eq('identifier', candidate).maybeSingle();
    if (!existing) return candidate;
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
}

// Création self-service d'un compte Timeline depuis le parcours d'onboarding (identifié par le seul
// jeton d'onboarding). Crée le compte auth + le profil (rôle bénévole), le relie à l'identité Slack,
// enregistre les compétences choisies, puis renvoie de quoi ouvrir la session.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    full_name?: string;
    password?: string;
    skill_ids?: unknown;
  };
  const token = body.token?.trim();
  const fullName = body.full_name?.trim();
  const password = typeof body.password === 'string' ? body.password : '';
  const skillIds = Array.isArray(body.skill_ids)
    ? Array.from(new Set(body.skill_ids.filter((id): id is string => typeof id === 'string' && id.length > 0)))
    : [];

  if (!token) return NextResponse.json({ error: 'Lien invalide.' }, { status: 400 });
  if (!fullName) return NextResponse.json({ error: 'Le nom est obligatoire.' }, { status: 400 });
  if (password.length < 8) {
    return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' }, { status: 400 });
  }

  const service = createServerSupabaseServiceClient();

  const ctx = await consumeSlackOnboardingChallenge(token);
  if (!ctx) return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 400 });

  // Ce couple Slack ne doit pas déjà avoir un compte (sinon la personne aurait reçu un lien de
  // connexion, pas d'onboarding) — garde-fou contre un double envoi.
  const { data: existingIdentity } = await service
    .from('slack_identities')
    .select('profile_id')
    .eq('slack_team_id', ctx.slackTeamId)
    .eq('slack_user_id', ctx.slackUserId)
    .maybeSingle<{ profile_id: string | null }>();
  if (existingIdentity?.profile_id) {
    return NextResponse.json({ error: 'Un compte est déjà relié à ce compte Slack.' }, { status: 409 });
  }

  const identifier = await deriveUniqueIdentifier(service, fullName, ctx.slackUserId);
  const email = `${identifier}@timeline.local`;

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: { full_name: fullName }
  });
  if (createError || !created.user?.id) {
    return NextResponse.json({ error: createError?.message ?? 'Création du compte impossible.' }, { status: 400 });
  }
  const profileId = created.user.id;

  const { error: profileError } = await service.from('profiles').upsert(
    {
      id: profileId,
      full_name: fullName,
      email,
      identifier,
      role: 'benevole',
      slack_user_id: ctx.slackUserId,
      slack_team_id: ctx.slackTeamId,
      slack_connected_at: new Date().toISOString()
    },
    { onConflict: 'id' }
  );
  if (profileError) {
    return NextResponse.json({ error: `Compte créé mais profil incomplet : ${profileError.message}` }, { status: 500 });
  }

  await service.from('slack_identities').upsert(
    { profile_id: profileId, slack_team_id: ctx.slackTeamId, slack_user_id: ctx.slackUserId, is_primary: true, last_login_at: new Date().toISOString() },
    { onConflict: 'slack_team_id,slack_user_id' }
  );

  if (skillIds.length > 0) {
    await service.from('profile_skills').insert(skillIds.map((skill_id) => ({ profile_id: profileId, skill_id })));
  }

  const { data: linkData } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${new URL(request.url).origin}/missions` }
  });

  return NextResponse.json({
    ok: true,
    token_hash: linkData?.properties?.hashed_token ?? null,
    action_link: linkData?.properties?.action_link ?? null
  });
}
