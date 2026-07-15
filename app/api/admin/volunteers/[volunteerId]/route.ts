import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/api/permissions';
import type { PermissionAction } from '@/lib/types';

type UpdateVolunteerPayload = {
  full_name?: string;
  identifier?: string;
  sector?: string;
  skill_ids?: string[];
  password?: string;
  eope_user_id?: string | null;
};

// Autorisation du domaine bénévoles : lecture avec can_see, écriture avec
// can_manage. L'admin passe implicitement via has_permission.
async function authorizeVolunteer(request: NextRequest, action: PermissionAction) {
  const auth = await requirePermission(request, 'volunteer', action);
  if (auth.errorResponse) return { error: auth.errorResponse, userId: null as string | null };
  return { error: null, userId: auth.user.id };
}

export async function GET(request: NextRequest, { params }: { params: { volunteerId: string } }) {
  const guard = await authorizeVolunteer(request, 'can_see');
  if (guard.error) {
    return guard.error;
  }

  const serviceClient = createServerSupabaseServiceClient();
  const volunteerId = params.volunteerId;

  const { data: volunteer, error: volunteerError } = await serviceClient
    .from('profiles')
    .select('id,full_name,identifier,sector,role,created_at,eope_user_id')
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
  const guard = await authorizeVolunteer(request, 'can_manage');
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
  const eopeUserIdProvided = payload.eope_user_id !== undefined;
  const eopeUserId = typeof payload.eope_user_id === 'string' ? payload.eope_user_id.trim() : '';

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
  if (eopeUserIdProvided) profileUpdates.eope_user_id = eopeUserId || null;

  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileUpdateError } = await serviceClient.from('profiles').update(profileUpdates).eq('id', volunteerId);

    if (profileUpdateError) {
      if (profileUpdateError.code === '23505' && eopeUserIdProvided) {
        return NextResponse.json({ error: 'Cet identifiant eOPE est déjà lié à un autre bénévole.' }, { status: 400 });
      }
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

export async function DELETE(request: NextRequest, { params }: { params: { volunteerId: string } }) {
  const guard = await authorizeVolunteer(request, 'can_manage');
  if (guard.error) {
    return guard.error;
  }

  const volunteerId = params.volunteerId;

  if (volunteerId === guard.userId) {
    return NextResponse.json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' }, { status: 400 });
  }

  const serviceClient = createServerSupabaseServiceClient();

  const { data: existingVolunteer, error: existingVolunteerError } = await serviceClient
    .from('profiles')
    .select('id,role')
    .eq('id', volunteerId)
    .single();

  if (existingVolunteerError || !existingVolunteer) {
    return NextResponse.json({ error: 'Bénévole introuvable.' }, { status: 404 });
  }

  if (existingVolunteer.role !== 'benevole') {
    return NextResponse.json({ error: 'Seuls les comptes bénévoles peuvent être supprimés depuis cet écran.' }, { status: 403 });
  }

  // doublures.declared_by / competence_validations.declared_by n'ont pas d'action ON DELETE :
  // la suppression du compte auth échouerait sur une contrainte de clé étrangère si on les laisse pointer dessus.
  const { error: reassignDoubluresError } = await serviceClient
    .from('doublures')
    .update({ declared_by: guard.userId })
    .eq('declared_by', volunteerId);

  if (reassignDoubluresError) {
    return NextResponse.json({ error: `Impossible de réattribuer les doublures déclarées : ${reassignDoubluresError.message}` }, { status: 500 });
  }

  const { error: reassignValidationsError } = await serviceClient
    .from('competence_validations')
    .update({ declared_by: guard.userId })
    .eq('declared_by', volunteerId);

  if (reassignValidationsError) {
    return NextResponse.json({ error: `Impossible de réattribuer les validations déclarées : ${reassignValidationsError.message}` }, { status: 500 });
  }

  const { error: deleteError } = await serviceClient.auth.admin.deleteUser(volunteerId);

  if (deleteError) {
    return NextResponse.json({ error: `Impossible de supprimer le compte : ${deleteError.message}` }, { status: 500 });
  }

  return NextResponse.json({ message: 'Bénévole supprimé avec succès.' });
}
