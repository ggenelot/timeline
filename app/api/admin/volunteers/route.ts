import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';

type CreateVolunteerPayload = {
  firstName?: string;
  lastName?: string;
  identifier?: string;
  role?: 'benevole';
  password?: string;
  skill_ids?: string[];
};

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'volunteer', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;
  const serviceClient = auth.serviceClient;

  let payload: CreateVolunteerPayload;

  try {
    payload = (await request.json()) as CreateVolunteerPayload;
  } catch {
    return NextResponse.json({ error: 'Le corps de la requête est invalide.' }, { status: 400 });
  }

  const firstName = payload.firstName?.trim() ?? '';
  const lastName = payload.lastName?.trim() ?? '';
  const identifier = payload.identifier?.trim().toLowerCase() ?? '';
  const password = payload.password?.trim() ?? '';
  const skillIds = Array.isArray(payload.skill_ids)
    ? payload.skill_ids.map((skillId) => skillId.trim()).filter((skillId) => skillId.length > 0)
    : [];

  if (!firstName) {
    return NextResponse.json({ error: 'Le prénom est obligatoire.' }, { status: 400 });
  }

  if (!lastName) {
    return NextResponse.json({ error: 'Le nom est obligatoire.' }, { status: 400 });
  }

  if (!identifier) {
    return NextResponse.json({ error: 'Un identifiant est obligatoire.' }, { status: 400 });
  }

  if (!/^[a-z0-9._-]+$/.test(identifier)) {
    return NextResponse.json({ error: "L'identifiant ne peut contenir que des lettres minuscules, chiffres, points, tirets et underscores." }, { status: 400 });
  }

  if (!password) {
    return NextResponse.json({ error: 'Le mot de passe est obligatoire.' }, { status: 400 });
  }

  if (password.length < 10) {
    return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 10 caractères.' }, { status: 400 });
  }

  const fullName = `${firstName} ${lastName}`.trim();
  const authEmail = `${identifier}@timeline.local`;

  const { data: createdUserData, error: createUserError } = await serviceClient.auth.admin.createUser({
    email: authEmail,
    email_confirm: true,
    password,
    user_metadata: {
      full_name: fullName
    }
  });

  if (createUserError || !createdUserData.user) {
    const genericError = 'Impossible de créer le compte utilisateur.';
    const isDuplicateError = createUserError?.message?.toLowerCase().includes('already');
    return NextResponse.json(
      {
        error: isDuplicateError ? 'Un utilisateur avec cet identifiant existe déjà.' : createUserError?.message ?? genericError
      },
      { status: 400 }
    );
  }

  const profilePayload = {
    id: createdUserData.user.id,
    full_name: fullName,
    email: authEmail,
    identifier,
    role: 'benevole' as const
  };

  let { error: profileUpsertError } = await serviceClient.from('profiles').upsert(profilePayload, { onConflict: 'id' });
  const isMissingIdentifierSchemaCacheError =
    profileUpsertError?.message &&
    /could not find/i.test(profileUpsertError.message) &&
    /identifier/i.test(profileUpsertError.message) &&
    /profiles/i.test(profileUpsertError.message) &&
    /schema cache/i.test(profileUpsertError.message);

  if (isMissingIdentifierSchemaCacheError) {
    const { identifier: _, ...fallbackPayload } = profilePayload;
    const fallbackResult = await serviceClient.from('profiles').upsert(fallbackPayload, { onConflict: 'id' });
    profileUpsertError = fallbackResult.error;
  }

  if (profileUpsertError) {
    return NextResponse.json(
      {
        error: `Compte créé mais profil incomplet : ${profileUpsertError.message}`
      },
      { status: 500 }
    );
  }

  if (skillIds.length > 0) {
    const { data: selectedSkills, error: selectedSkillsError } = await serviceClient
      .from('skills')
      .select('id')
      .in('id', skillIds);

    if (selectedSkillsError) {
      return NextResponse.json({ error: `Compte créé mais impossible de vérifier les compétences : ${selectedSkillsError.message}` }, { status: 500 });
    }

    if ((selectedSkills ?? []).length !== skillIds.length) {
      return NextResponse.json({ error: 'Compte créé mais certaines compétences sont invalides.' }, { status: 400 });
    }

    const { error: insertSkillsError } = await serviceClient.from('profile_skills').insert(
      skillIds.map((skillId) => ({ profile_id: createdUserData.user.id, skill_id: skillId }))
    );

    if (insertSkillsError) {
      return NextResponse.json({ error: `Compte créé mais impossible d'attribuer les compétences : ${insertSkillsError.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({
    message: 'Bénévole créé avec succès.',
    volunteer: {
      id: createdUserData.user.id,
      firstName,
      lastName,
      email: authEmail,
      identifier,
      role: 'benevole'
    }
  });
}
