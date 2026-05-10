import { NextRequest, NextResponse } from 'next/server';
import { MissionProposalResponse } from '@/lib/types';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
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

async function assertAdmin(token: string) {
  const auth = await requireAuthenticatedUser(token);

  if (auth.errorResponse || !auth.client || !auth.user || !auth.profile) {
    return { client: null, userId: null, errorResponse: auth.errorResponse };
  }

  if (auth.profile.role !== 'admin') {
    return {
      client: null,
      userId: null,
      errorResponse: NextResponse.json({ error: 'Accès refusé : seuls les administrateurs peuvent gérer les statuts bénévoles.' }, { status: 403 })
    };
  }

  return { client: auth.client, userId: auth.user.id, errorResponse: null };
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
  const token = getBearerToken(request);

  if (!token) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const guard = await assertAdmin(token);
  if (guard.errorResponse || !guard.client) {
    return guard.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  const missionId = params.missionId;

  const { data: proposals, error: proposalsError } = await guard.client
    .from('mission_proposals')
    .select('id,mission_id,volunteer_id,proposed_by,response,status,decided_at,decided_by,created_at,updated_by_admin,updated_by,updated_at,source,volunteer:profiles!mission_proposals_volunteer_id_fkey(id,full_name,email)')
    .eq('mission_id', missionId)
    .order('created_at', { ascending: true });

  if (proposalsError) {
    return NextResponse.json({ error: `Impossible de charger les statuts de mission : ${proposalsError.message}` }, { status: 500 });
  }

  const { data: volunteers, error: volunteersError } = await guard.client
    .from('profiles')
    .select('id,full_name,email,role')
    .eq('role', 'benevole')
    .order('full_name', { ascending: true });

  if (volunteersError) {
    return NextResponse.json({ error: `Impossible de charger la liste des bénévoles : ${volunteersError.message}` }, { status: 500 });
  }

  return NextResponse.json({ proposals: proposals ?? [], volunteers: volunteers ?? [] });
}

export async function PUT(request: NextRequest, { params }: { params: { missionId: string } }) {
  const token = getBearerToken(request);

  if (!token) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const guard = await assertAdmin(token);
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

  const missionId = params.missionId;

  const { data: volunteerProfile, error: volunteerError } = await guard.client
    .from('profiles')
    .select('id,role')
    .eq('id', parsed.volunteerId)
    .single();

  if (volunteerError || !volunteerProfile || volunteerProfile.role !== 'benevole') {
    return NextResponse.json({ error: 'Le profil sélectionné doit être un bénévole existant.' }, { status: 400 });
  }

  const { data: mission, error: missionError } = await guard.client
    .from('missions')
    .select('id,status')
    .eq('id', missionId)
    .single<{ id: string; status: string }>();

  if (missionError || !mission) {
    return NextResponse.json({ error: 'Mission introuvable.' }, { status: 404 });
  }

  if (mission.status !== 'proposed') {
    return NextResponse.json(
      { error: "Impossible de modifier la disponibilité : l'activité doit être au statut « Proposée » pour accepter des réponses." },
      { status: 403 }
    );
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
