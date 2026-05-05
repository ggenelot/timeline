import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseAnonClient, createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { notifyVolunteerRoleUpdatedByAdmin } from '@/lib/slack/workflows';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type UpdateVolunteerPayload = {
  full_name?: string;
  email?: string;
  phone?: string;
  sector?: string;
  role?: 'benevole' | 'responsable';
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
    .select('id,full_name,email,phone,sector,role,created_at')
    .eq('id', volunteerId)
    .single();

  if (volunteerError || !volunteer) {
    return NextResponse.json({ error: 'Bénévole introuvable.' }, { status: 404 });
  }

  const { data: profileSkills, error: profileSkillsError } = await serviceClient
    .from('profile_skills')
    .select('skill_id, skill:skills(id,name)')
    .eq('profile_id', volunteerId);

  if (profileSkillsError) {
    return NextResponse.json({ error: `Impossible de charger les compétences : ${profileSkillsError.message}` }, { status: 500 });
  }

  const { data: skills, error: skillsError } = await serviceClient.from('skills').select('id,name,category').order('name', { ascending: true });

  if (skillsError) {
    return NextResponse.json({ error: `Impossible de charger le référentiel de compétences : ${skillsError.message}` }, { status: 500 });
  }

  return NextResponse.json({ volunteer, profileSkills: profileSkills ?? [], skills: skills ?? [] });
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
  const fullName = payload.full_name?.trim() ?? '';
  const email = payload.email?.trim().toLowerCase() ?? '';
  const phone = payload.phone?.trim() ?? '';
  const sector = payload.sector?.trim() ?? '';
  const role = payload.role ?? 'benevole';
  const skillIds = Array.from(new Set(payload.skill_ids ?? []));
  const password = payload.password?.trim() ?? '';

  if (!fullName) {
    return NextResponse.json({ error: 'Le nom complet est obligatoire.' }, { status: 400 });
  }

  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'Un email valide est obligatoire.' }, { status: 400 });
  }

  if (!['benevole', 'responsable'].includes(role)) {
    return NextResponse.json({ error: 'Rôle invalide.' }, { status: 400 });
  }

  if (password && password.length < 10) {
    return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 10 caractères.' }, { status: 400 });
  }

  const serviceClient = createServerSupabaseServiceClient();

  const { data: existingVolunteer, error: existingVolunteerError } = await serviceClient
    .from('profiles')
    .select('id,full_name,role,slack_user_id')
    .eq('id', volunteerId)
    .single();

  if (existingVolunteerError || !existingVolunteer) {
    return NextResponse.json({ error: 'Bénévole introuvable.' }, { status: 404 });
  }


  if (skillIds.length > 0) {
    const { data: selectedSkills, error: selectedSkillsError } = await serviceClient.from('skills').select('id').in('id', skillIds);

    if (selectedSkillsError) {
      return NextResponse.json({ error: `Impossible de vérifier les compétences : ${selectedSkillsError.message}` }, { status: 500 });
    }

    if ((selectedSkills ?? []).length !== skillIds.length) {
      return NextResponse.json({ error: 'Une ou plusieurs compétences sélectionnées sont invalides.' }, { status: 400 });
    }
  }


  const { error: profileUpdateError } = await serviceClient
    .from('profiles')
    .update({
      full_name: fullName,
      email,
      phone: phone || null,
      sector: sector || null,
      role
    })
    .eq('id', volunteerId);

  if (profileUpdateError) {
    return NextResponse.json({ error: `Impossible de mettre à jour le profil : ${profileUpdateError.message}` }, { status: 400 });
  }

  const authUpdatePayload: { email: string; user_metadata: { full_name: string; phone: string | null }; password?: string } = {
    email,
    user_metadata: {
      full_name: fullName,
      phone: phone || null
    }
  };

  if (password) {
    authUpdatePayload.password = password;
  }

  const { error: authUpdateError } = await serviceClient.auth.admin.updateUserById(volunteerId, authUpdatePayload);

  if (authUpdateError) {
    return NextResponse.json({ error: `Profil mis à jour, mais email Auth non synchronisé : ${authUpdateError.message}` }, { status: 500 });
  }

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

  try {
    await notifyVolunteerRoleUpdatedByAdmin({
      profileId: volunteerId,
      fullName,
      slackUserId: existingVolunteer.slack_user_id,
      previousRole: existingVolunteer.role,
      nextRole: role
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: 'Bénévole modifié avec succès, mais échec de notification Slack.',
        slackError: error instanceof Error ? error.message : 'Erreur inconnue'
      },
      { status: 202 }
    );
  }

  return NextResponse.json({ message: 'Bénévole modifié avec succès.' });
}
