import { NextRequest, NextResponse } from 'next/server';
import { MissionProposalResponse } from '@/lib/types';
import { requireMissionPermission } from '@/lib/api/permissions';
import { notifyVolunteerAvailabilityUpdatedByAdmin, notifyVolunteerRejected } from '@/lib/slack/workflows';

type AdminAssignableResponse = 'available' | 'unavailable';

type AdminMissionVolunteerPayload = {
  volunteer_id?: string;
  response?: MissionProposalResponse;
};

const ALLOWED_ADMIN_RESPONSES: AdminAssignableResponse[] = ['available', 'unavailable'];

function isAdminAssignableResponse(response: MissionProposalResponse): response is AdminAssignableResponse {
  return response === 'available' || response === 'unavailable';
}

// Gestion des statuts bénévoles d'une mission : réservée à qui peut gérer
// CETTE mission (admin, créateur, ou can_manage couvrant son type).
async function authorizeMission(request: NextRequest, missionId: string) {
  const auth = await requireMissionPermission(request, missionId);
  if (auth.errorResponse) {
    return { client: null, userId: null, errorResponse: auth.errorResponse };
  }
  return { client: auth.serviceClient, userId: auth.user.id, errorResponse: null };
}

function parsePayload(payload: AdminMissionVolunteerPayload) {
  const volunteerId = payload.volunteer_id?.trim() ?? '';

  if (!volunteerId) {
    return { error: 'Le bénévole est obligatoire.', volunteerId: null, response: null };
  }

  if (!payload.response || !isAdminAssignableResponse(payload.response)) {
    return { error: `Statut invalide. Valeurs autorisées: ${ALLOWED_ADMIN_RESPONSES.join(', ')}.`, volunteerId: null, response: null };
  }

  return { error: null, volunteerId, response: payload.response };
}

export async function GET(request: NextRequest, { params }: { params: { missionId: string } }) {
  const missionId = params.missionId;
  const guard = await authorizeMission(request, missionId);
  if (guard.errorResponse || !guard.client) {
    return guard.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  const { data: proposals, error: proposalsError } = await guard.client
    .from('mission_proposals')
    .select('id,mission_id,volunteer_id,proposed_by,response,status,decided_at,decided_by,created_at,updated_by_admin,updated_by,updated_at,source,volunteer:profiles!mission_proposals_volunteer_id_fkey(id,full_name,email)')
    .eq('mission_id', missionId)
    .order('created_at', { ascending: true });

  if (proposalsError) {
    return NextResponse.json({ error: `Impossible de charger les statuts de mission : ${proposalsError.message}` }, { status: 500 });
  }

  type VolunteerRow = { id: string; full_name: string | null; email: string; role: string; avatar_url: string | null };
  type VolunteerWithSkillsRow = VolunteerRow & { profile_skills: Array<{ status: string | null; skill_id: string }> | null };

  const { data: volunteers, error: volunteersError } = await guard.client
    .from('profiles')
    .select('id,full_name,email,role,avatar_url,profile_skills(status,skill_id)')
    .eq('role', 'benevole')
    .order('full_name', { ascending: true });

  if (volunteersError) {
    return NextResponse.json({ error: `Impossible de charger la liste des bénévoles : ${volunteersError.message}` }, { status: 500 });
  }

  // Compétences validées par bénévole (pour le filtre "chercher parmi tous
  // les bénévoles" du board de missions, restreint à la compétence requise).
  const { data: validatingStatuses, error: statusesError } = await guard.client
    .from('skill_statuses')
    .select('key')
    .eq('is_validating', true);

  if (statusesError) {
    return NextResponse.json({ error: `Impossible de charger les statuts de compétence : ${statusesError.message}` }, { status: 500 });
  }

  const validatingKeys = new Set((validatingStatuses ?? []).map((s) => s.key));
  const volunteersWithSkills = ((volunteers ?? []) as unknown as VolunteerWithSkillsRow[]).map(({ profile_skills, ...volunteer }) => ({
    ...volunteer,
    validatedSkillIds: (profile_skills ?? []).filter((ps) => ps.status && validatingKeys.has(ps.status)).map((ps) => ps.skill_id),
  }));

  return NextResponse.json({ proposals: proposals ?? [], volunteers: volunteersWithSkills });
}

export async function PUT(request: NextRequest, { params }: { params: { missionId: string } }) {
  const missionId = params.missionId;
  const guard = await authorizeMission(request, missionId);
  if (guard.errorResponse || !guard.client || !guard.userId) {
    return guard.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  let payload: AdminMissionVolunteerPayload;
  try {
    payload = (await request.json()) as AdminMissionVolunteerPayload;
  } catch {
    return NextResponse.json({ error: 'Le corps de la requête est invalide.' }, { status: 400 });
  }

  const parsed = parsePayload(payload);
  if (parsed.error || !parsed.volunteerId || !parsed.response) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data: volunteerProfile, error: volunteerError } = await guard.client
    .from('profiles')
    .select('id,role')
    .eq('id', parsed.volunteerId)
    .single();

  if (volunteerError || !volunteerProfile || volunteerProfile.role !== 'benevole') {
    return NextResponse.json({ error: 'Le profil sélectionné doit être un bénévole existant.' }, { status: 400 });
  }

  const { data: mission, error: missionError } = await guard.client.from('missions').select('id').eq('id', missionId).single();

  if (missionError || !mission) {
    return NextResponse.json({ error: 'Mission introuvable.' }, { status: 404 });
  }

  const { data: existingProposal } = await guard.client
    .from('mission_proposals')
    .select('response')
    .eq('mission_id', missionId)
    .eq('volunteer_id', parsed.volunteerId)
    .maybeSingle<{ response: MissionProposalResponse }>();

  const previousResponse = existingProposal?.response ?? null;

  const upsertPayload = {
    mission_id: missionId,
    volunteer_id: parsed.volunteerId,
    proposed_by: guard.userId,
    response: parsed.response,
    status: 'pending' as const,
    updated_by_admin: true,
    updated_by: guard.userId,
    source: 'admin' as const,
    updated_at: new Date().toISOString()
  };

  const { data: upsertedProposal, error: upsertError } = await guard.client
    .from('mission_proposals')
    .upsert(upsertPayload, {
      onConflict: 'mission_id,volunteer_id'
    })
    .select('id,mission_id,volunteer_id,proposed_by,response,status,decided_at,decided_by,created_at,updated_by_admin,updated_by,updated_at,source,responded_at,volunteer:profiles!mission_proposals_volunteer_id_fkey(id,full_name,email)')
    .single();

  if (upsertError) {
    if (upsertError.message.toLowerCase().includes('row-level security')) {
      return NextResponse.json({ error: 'Action refusée par la politique RLS.' }, { status: 403 });
    }

    return NextResponse.json({ error: `Impossible d'enregistrer le statut : ${upsertError.message}` }, { status: 400 });
  }

  try {
    await notifyVolunteerAvailabilityUpdatedByAdmin({
      missionId,
      profileId: parsed.volunteerId,
      previousResponse,
      nextResponse: parsed.response
    });

    if (parsed.response === 'unavailable') {
      await notifyVolunteerRejected(missionId, parsed.volunteerId);
    }
  } catch (error) {
    return NextResponse.json(
      {
        message: 'Statut bénévole enregistré, mais échec de notification Slack.',
        slackError: error instanceof Error ? error.message : 'Erreur inconnue'
      },
      { status: 202 }
    );
  }

  return NextResponse.json({
    message: 'Statut bénévole enregistré par un administrateur.',
    proposal: upsertedProposal
  });
}
