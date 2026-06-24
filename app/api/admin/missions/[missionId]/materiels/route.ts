import { NextRequest, NextResponse } from 'next/server';
import { MissionMaterielAssignmentStatus } from '@/lib/types';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';

const ASSIGNMENT_STATUSES: MissionMaterielAssignmentStatus[] = ['selected', 'confirmed', 'returned', 'declined'];
const ACTIVE_ASSIGNMENT_STATUSES: MissionMaterielAssignmentStatus[] = ['selected', 'confirmed'];

type AdminMissionMaterielPayload = {
  materiel_instance_id?: string;
  mission_required_materiel_id?: string | null;
  assignment_status?: MissionMaterielAssignmentStatus;
};

async function assertAdmin(token: string) {
  const auth = await requireAuthenticatedUser(token);

  if (auth.errorResponse || !auth.client || !auth.user || !auth.profile) {
    return { client: null, errorResponse: auth.errorResponse };
  }

  if (auth.profile.role !== 'admin') {
    return {
      client: null,
      errorResponse: NextResponse.json({ error: 'Accès refusé : seuls les administrateurs peuvent gérer le matériel des missions.' }, { status: 403 })
    };
  }

  return { client: auth.client, errorResponse: null };
}

function isAssignmentStatus(value: string | undefined): value is MissionMaterielAssignmentStatus {
  return ASSIGNMENT_STATUSES.includes(value as MissionMaterielAssignmentStatus);
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

  const { data: mission, error: missionError } = await guard.client
    .from('missions')
    .select('id,starts_at,ends_at')
    .eq('id', missionId)
    .single();

  if (missionError || !mission) {
    return NextResponse.json({ error: 'Mission introuvable.' }, { status: 404 });
  }

  const { data: requiredMateriels, error: requiredMaterielsError } = await guard.client
    .from('mission_required_materiels')
    .select('id,mission_id,materiel_type_id,quantity,materiel_type:materiel_types(id,name,code)')
    .eq('mission_id', missionId);

  if (requiredMaterielsError) {
    return NextResponse.json({ error: `Impossible de charger le matériel requis : ${requiredMaterielsError.message}` }, { status: 500 });
  }

  const { data: assignments, error: assignmentsError } = await guard.client
    .from('mission_materiel_assignments')
    .select('id,mission_id,materiel_instance_id,mission_required_materiel_id,assignment_status,created_at,materiel_instance:materiel_instances(id,label,location,materiel_type_id,status_id,materiel_type:materiel_types(id,name,code),status:materiel_instance_statuses(*))')
    .eq('mission_id', missionId);

  if (assignmentsError) {
    return NextResponse.json({ error: `Impossible de charger les affectations de matériel : ${assignmentsError.message}` }, { status: 500 });
  }

  const { data: instances, error: instancesError } = await guard.client
    .from('materiel_instances')
    .select('id,label,location,materiel_type_id,status_id,materiel_type:materiel_types(id,name,code),status:materiel_instance_statuses(*)')
    .order('label', { ascending: true });

  if (instancesError) {
    return NextResponse.json({ error: `Impossible de charger les instances de matériel : ${instancesError.message}` }, { status: 500 });
  }

  const { data: overlappingAssignments, error: overlappingError } = await guard.client
    .from('mission_materiel_assignments')
    .select('materiel_instance_id,assignment_status,mission:missions(starts_at,ends_at)')
    .neq('mission_id', missionId)
    .in('assignment_status', ACTIVE_ASSIGNMENT_STATUSES);

  if (overlappingError) {
    return NextResponse.json({ error: `Impossible de vérifier les disponibilités : ${overlappingError.message}` }, { status: 500 });
  }

  const busyInstanceIds = new Set(
    (overlappingAssignments ?? [])
      .filter((row) => {
        const otherMission = Array.isArray(row.mission) ? row.mission[0] : row.mission;
        if (!otherMission) return false;
        return otherMission.starts_at < mission.ends_at && otherMission.ends_at > mission.starts_at;
      })
      .map((row) => row.materiel_instance_id)
  );

  const availableInstances = (instances ?? []).filter((instance) => {
    const status = Array.isArray(instance.status) ? instance.status[0] : instance.status;
    return Boolean(status?.is_available) && !busyInstanceIds.has(instance.id);
  });

  return NextResponse.json({
    requiredMateriels: requiredMateriels ?? [],
    assignments: assignments ?? [],
    availableInstances
  });
}

export async function PUT(request: NextRequest, { params }: { params: { missionId: string } }) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const guard = await assertAdmin(token);
  if (guard.errorResponse || !guard.client) {
    return guard.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  let payload: AdminMissionMaterielPayload;
  try {
    payload = (await request.json()) as AdminMissionMaterielPayload;
  } catch {
    return NextResponse.json({ error: 'Le corps de la requête est invalide.' }, { status: 400 });
  }

  const materielInstanceId = payload.materiel_instance_id?.trim() ?? '';
  if (!materielInstanceId) {
    return NextResponse.json({ error: "L'instance de matériel est obligatoire." }, { status: 400 });
  }

  const assignmentStatus = payload.assignment_status ?? 'selected';
  if (!isAssignmentStatus(assignmentStatus)) {
    return NextResponse.json({ error: `Statut invalide. Valeurs autorisées: ${ASSIGNMENT_STATUSES.join(', ')}.` }, { status: 400 });
  }

  const missionId = params.missionId;

  const { data: mission, error: missionError } = await guard.client.from('missions').select('id').eq('id', missionId).single();
  if (missionError || !mission) {
    return NextResponse.json({ error: 'Mission introuvable.' }, { status: 404 });
  }

  const { data: upserted, error: upsertError } = await guard.client
    .from('mission_materiel_assignments')
    .upsert(
      {
        mission_id: missionId,
        materiel_instance_id: materielInstanceId,
        mission_required_materiel_id: payload.mission_required_materiel_id ?? null,
        assignment_status: assignmentStatus
      },
      { onConflict: 'mission_id,materiel_instance_id' }
    )
    .select('id,mission_id,materiel_instance_id,mission_required_materiel_id,assignment_status,created_at,materiel_instance:materiel_instances(id,label,location,materiel_type_id,status_id,materiel_type:materiel_types(id,name,code),status:materiel_instance_statuses(*))')
    .single();

  if (upsertError) {
    if (upsertError.message.toLowerCase().includes('row-level security')) {
      return NextResponse.json({ error: 'Action refusée par la politique RLS.' }, { status: 403 });
    }
    return NextResponse.json({ error: `Impossible d'affecter le matériel : ${upsertError.message}` }, { status: 400 });
  }

  return NextResponse.json({ assignment: upserted });
}

export async function DELETE(request: NextRequest, { params }: { params: { missionId: string } }) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const guard = await assertAdmin(token);
  if (guard.errorResponse || !guard.client) {
    return guard.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  const materielInstanceId = request.nextUrl.searchParams.get('materiel_instance_id')?.trim() ?? '';
  if (!materielInstanceId) {
    return NextResponse.json({ error: "L'instance de matériel est obligatoire." }, { status: 400 });
  }

  const { error: deleteError } = await guard.client
    .from('mission_materiel_assignments')
    .delete()
    .eq('mission_id', params.missionId)
    .eq('materiel_instance_id', materielInstanceId);

  if (deleteError) {
    return NextResponse.json({ error: `Impossible de retirer l'affectation : ${deleteError.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
