import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseAnonClient, createServerSupabaseServiceClient } from '@/lib/supabase/server';

type UpdateVolunteerPayload = {
  full_name?: string;
  identifier?: string;
  sector?: string;
  skill_ids?: string[];
  password?: string;
};

function getBearerToken(request: NextRequest): string {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.replace('Bearer ', '').trim() : '';
}

async function assertAdmin(token: string) {
  const requesterClient = createServerSupabaseAnonClient(token);
  const { data: userData, error: userError } = await requesterClient.auth.getUser(token);

  if (userError || !userData.user) {
    return { error: NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 }) };
  }

  const { data: requesterProfile, error: requesterProfileError } = await requesterClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (requesterProfileError || !requesterProfile || requesterProfile.role !== 'admin') {
    return {
      error: NextResponse.json({ error: 'Accès refusé : seuls les administrateurs peuvent modifier un bénévole.' }, { status: 403 })
    };
  }

  return { error: null };
}

export async function GET(request: NextRequest, { params }: { params: { volunteerId: string } }) {
  const token = getBearerToken(request);

  if (!token) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const guard = await assertAdmin(token);
  if (guard.error) {
    return guard.error;
  }

  const serviceClient = createServerSupabaseServiceClient();
  const volunteerId = params.volunteerId;

  const { data: volunteer, error: volunteerError } = await serviceClient
    .from('profiles')
    .select('id,full_name,identifier,sector,role,created_at')
    .eq('id', volunteerId)
    .single();

  if (volunteerError || !volunteer) {
    return NextResponse.json({ error: 'Bénévole introuvable.' }, { status: 404 });
  }

  const { data: profileSkills, error: profileSkillsError } = await serviceClient
    .from('profile_skills')
    .select('skill_id')
    .eq('profile_id', volunteerId);

  if (profileSkillsError) {
    return NextResponse.json({ error: `Impossible de charger les compétences : ${profileSkillsError.message}` }, { status: 500 });
  }

  return NextResponse.json({ volunteer, profileSkills: profileSkills ?? [] });
}

export async function PATCH(request: NextRequest, { params }: { params: { volunteerId: string } }) {
  const token = getBearerToken(request);

  if (!token) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const guard = await assertAdmin(token);
  if (guard.error) {
    return guard.error;
  }

  let payload: UpdateVolunteerPayload;
  try {
    payload = (await request.json()) as UpdateVolunteerPayload;
  } catch {
    return NextResponse.json({ error: 'Le corps de la requête est invalide.' }, { status: 400 });
  }

  const volunteerId = params.volunteerId;
  const fullNameProvided = payload.full_name !== undefined;
  const identifierProvided = payload.identifier !== undefined;
  const sectorProvided = payload.sector !== undefined;
  const fullName = payload.full_name?.trim() ?? '';
  const identifier = payload.identifier?.trim().toLowerCase() ?? '';
  const sector = payload.sector?.trim() ?? '';
  const skillIdsProvided = payload.skill_ids !== undefined;
  const skillIds = Array.from(new Set(payload.skill_ids ?? []));
  const password = payload.password?.trim() ?? '';
  const passwordProvided = password.length > 0;

  if (fullNameProvided && !fullName) {
    return NextResponse.json({ error: 'Le nom complet est obligatoire.' }, { status: 400 });
  }

  if (identifierProvided) {
    if (!identifier) {
      return NextResponse.json({ error: "L'identifiant est obligatoire." }, { status: 400 });
    }

    if (!/^[a-z0-9._-]+$/.test(identifier)) {
      return NextResponse.json({ error: "L'identifiant ne peut contenir que des lettres minuscules, chiffres, points, tirets et underscores." }, { status: 400 });
    }
  }

  if (passwordProvided && password.length < 10) {
    return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 10 caractères.' }, { status: 400 });
  }

  const serviceClient = createServerSupabaseServiceClient();

  const { data: existingVolunteer, error: existingVolunteerError } = await serviceClient
    .from('profiles')
    .select('id,full_name')
    .eq('id', volunteerId)
    .single();

  if (existingVolunteerError || !existingVolunteer) {
    return NextResponse.json({ error: 'Bénévole introuvable.' }, { status: 404 });
  }

  if (skillIdsProvided && skillIds.length > 0) {
    const { data: selectedSkills, error: selectedSkillsError } = await serviceClient.from('skills').select('id').in('id', skillIds);

    if (selectedSkillsError) {
      return NextResponse.json({ error: `Impossible de vérifier les compétences : ${selectedSkillsError.message}` }, { status: 500 });
    }

    if ((selectedSkills ?? []).length !== skillIds.length) {
      return NextResponse.json({ error: 'Une ou plusieurs compétences sélectionnées sont invalides.' }, { status: 400 });
    }
  }

  const authEmail = identifierProvided ? `${identifier}@timeline.local` : null;

  const profileUpdates: Record<string, unknown> = {};
  if (fullNameProvided) profileUpdates.full_name = fullName;
  if (identifierProvided) { profileUpdates.identifier = identifier; profileUpdates.email = authEmail; }
  if (sectorProvided) profileUpdates.sector = sector || null;

  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileUpdateError } = await serviceClient.from('profiles').update(profileUpdates).eq('id', volunteerId);

    if (profileUpdateError) {
      return NextResponse.json({ error: `Impossible de mettre à jour le profil : ${profileUpdateError.message}` }, { status: 400 });
    }
  }

  if (identifierProvided || fullNameProvided || passwordProvided) {
    const authUpdatePayload: { email?: string; user_metadata?: { full_name: string }; password?: string } = {};
    if (authEmail) authUpdatePayload.email = authEmail;
    if (fullNameProvided) authUpdatePayload.user_metadata = { full_name: fullName };
    if (passwordProvided) authUpdatePayload.password = password;

    const { error: authUpdateError } = await serviceClient.auth.admin.updateUserById(volunteerId, authUpdatePayload);

    if (authUpdateError) {
      return NextResponse.json({ error: `Profil mis à jour, mais compte Auth non synchronisé : ${authUpdateError.message}` }, { status: 500 });
    }
  }

  if (skillIdsProvided) {
    const { error: deleteSkillsError } = await serviceClient.from('profile_skills').delete().eq('profile_id', volunteerId);

    if (deleteSkillsError) {
      return NextResponse.json({ error: `Impossible de mettre à jour les compétences : ${deleteSkillsError.message}` }, { status: 400 });
    }

    if (skillIds.length > 0) {
      const { error: insertSkillsError } = await serviceClient.from('profile_skills').insert(
        skillIds.map((skillId) => ({
          profile_id: volunteerId,
          skill_id: skillId
        }))
      );

      if (insertSkillsError) {
        return NextResponse.json({ error: `Impossible d'enregistrer les compétences : ${insertSkillsError.message}` }, { status: 400 });
      }
    }
  }

  return NextResponse.json({ message: 'Bénévole modifié avec succès.' });
}
