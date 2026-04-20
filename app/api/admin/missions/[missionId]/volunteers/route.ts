import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseAnonClient } from '@/lib/supabase/server';
import { MissionProposalResponse } from '@/lib/types';

type AdminMissionVolunteerPayload = {
  volunteer_id?: string;
  response?: MissionProposalResponse;
};

const ALLOWED_ADMIN_RESPONSES: MissionProposalResponse[] = ['available', 'unavailable'];

function getBearerToken(request: NextRequest): string {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.replace('Bearer ', '').trim() : '';
}

async function assertAdmin(token: string) {
  const client = createServerSupabaseAnonClient(token);
  const {
    data: { user },
    error: userError
  } = await client.auth.getUser(token);

  if (userError || !user) {
    return { client: null, userId: null, errorResponse: NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await client.from('profiles').select('id,role').eq('id', user.id).single();

  if (profileError || !profile || profile.role !== 'admin') {
    return {
      client: null,
      userId: null,
      errorResponse: NextResponse.json({ error: 'Accès refusé : seuls les administrateurs peuvent gérer les statuts bénévoles.' }, { status: 403 })
    };
  }

  return { client, userId: user.id, errorResponse: null };
}

function parsePayload(payload: AdminMissionVolunteerPayload) {
  const volunteerId = payload.volunteer_id?.trim() ?? '';

  if (!volunteerId) {
    return { error: 'Le bénévole est obligatoire.', volunteerId: null, response: null };
  }

  if (!payload.response || !ALLOWED_ADMIN_RESPONSES.includes(payload.response)) {
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
    return guard.errorResponse;
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
    return guard.errorResponse;
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

  const { data: mission, error: missionError } = await guard.client.from('missions').select('id').eq('id', missionId).single();

  if (missionError || !mission) {
    return NextResponse.json({ error: 'Mission introuvable.' }, { status: 404 });
  }

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

  const { error: upsertError } = await guard.client.from('mission_proposals').upsert(upsertPayload, {
    onConflict: 'mission_id,volunteer_id'
  });

  if (upsertError) {
    if (upsertError.message.toLowerCase().includes('row-level security')) {
      return NextResponse.json({ error: 'Action refusée par la politique RLS.' }, { status: 403 });
    }

    return NextResponse.json({ error: `Impossible d'enregistrer le statut : ${upsertError.message}` }, { status: 400 });
  }

  return NextResponse.json({ message: 'Statut bénévole enregistré par un administrateur.' });
}
