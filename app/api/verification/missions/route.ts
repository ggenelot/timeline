import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { MissionVerificationMaterielStatus, MissionVerificationMaterielSummary, MissionVerificationSummary } from '@/lib/types';

export async function GET(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.client || !auth.user) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  const { data: assignments, error: assignmentsError } = await auth.client
    .from('mission_assignments')
    .select('mission:missions(id,title,starts_at,ends_at,location,status,mission_type_id)')
    .eq('volunteer_id', auth.user.id)
    .in('assignment_status', ['selected', 'confirmed']);

  if (assignmentsError) {
    return NextResponse.json({ error: assignmentsError.message }, { status: 400 });
  }

  type MissionRow = {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    location: string | null;
    status: string;
    mission_type_id: string;
  };
  const missions = (assignments ?? [])
    .map((row) => (Array.isArray(row.mission) ? row.mission[0] : row.mission) as MissionRow | null)
    .filter((mission): mission is MissionRow => mission !== null && mission.status === 'confirmed');

  if (missions.length === 0) {
    return NextResponse.json({ missions: [] satisfies MissionVerificationSummary[] });
  }

  const missionIds = missions.map((mission) => mission.id);

  const { data: missionTypes, error: missionTypesError } = await auth.client.from('mission_types').select('id,name');
  if (missionTypesError) {
    return NextResponse.json({ error: missionTypesError.message }, { status: 400 });
  }
  const missionTypeNameById = new Map((missionTypes ?? []).map((row) => [row.id, row.name as string]));

  const { data: requiredMateriels, error: requiredError } = await auth.client
    .from('mission_required_materiels')
    .select('id,mission_id')
    .in('mission_id', missionIds);

  if (requiredError) {
    return NextResponse.json({ error: requiredError.message }, { status: 400 });
  }

  const missionByRequirement = new Map<string, string>();
  for (const row of requiredMateriels ?? []) {
    missionByRequirement.set(row.id, row.mission_id);
  }

  const requiredMaterielIds = (requiredMateriels ?? []).map((row) => row.id);

  const { data: materielAssignments, error: materielAssignmentsError } =
    requiredMaterielIds.length > 0
      ? await auth.client
          .from('mission_materiel_assignments')
          .select('id,mission_required_materiel_id,materiel_type_id,materiel_type:materiel_types(id,name)')
          .in('mission_required_materiel_id', requiredMaterielIds)
      : { data: [], error: null };

  if (materielAssignmentsError) {
    return NextResponse.json({ error: materielAssignmentsError.message }, { status: 400 });
  }

  const containerTypeIds = [...new Set((materielAssignments ?? []).map((row) => row.materiel_type_id))];

  const { data: contents, error: contentsError } =
    containerTypeIds.length > 0
      ? await auth.client
          .from('materiel_type_contents')
          .select('parent_type_id,child_type_id,child_type:materiel_types!materiel_type_contents_child_type_id_fkey(is_container)')
      : { data: [], error: null };

  if (contentsError) {
    return NextResponse.json({ error: contentsError.message }, { status: 400 });
  }

  type ContentRow = { parent_type_id: string; child_type_id: string; child_type: { is_container: boolean } | { is_container: boolean }[] | null };

  const childrenByContainer = new Map<string, ContentRow[]>();
  for (const row of (contents ?? []) as ContentRow[]) {
    const list = childrenByContainer.get(row.parent_type_id) ?? [];
    list.push(row);
    childrenByContainer.set(row.parent_type_id, list);
  }

  function countLeafItems(containerTypeId: string, visited: Set<string>): number {
    if (visited.has(containerTypeId)) return 0;
    const nextVisited = new Set(visited).add(containerTypeId);
    const children = childrenByContainer.get(containerTypeId) ?? [];
    let count = 0;

    for (const content of children) {
      const childType = Array.isArray(content.child_type) ? content.child_type[0] : content.child_type;
      count += childType?.is_container ? countLeafItems(content.child_type_id, nextVisited) : 1;
    }

    return count;
  }

  const assignmentIds = (materielAssignments ?? []).map((row) => row.id);

  const { data: checkedItems, error: checkedError } =
    assignmentIds.length > 0
      ? await auth.client
          .from('mission_materiel_verification_items')
          .select('mission_materiel_assignment_id,status')
          .in('mission_materiel_assignment_id', assignmentIds)
      : { data: [], error: null };

  if (checkedError) {
    return NextResponse.json({ error: checkedError.message }, { status: 400 });
  }

  const checkedByAssignment = new Map<string, { checked: number; missing: number }>();
  for (const row of checkedItems ?? []) {
    const current = checkedByAssignment.get(row.mission_materiel_assignment_id) ?? { checked: 0, missing: 0 };
    current.checked += 1;
    if (row.status === 'missing' || row.status === 'partial') current.missing += 1;
    checkedByAssignment.set(row.mission_materiel_assignment_id, current);
  }

  function computeMaterielStatus(totalItems: number, checked: number, missing: number): MissionVerificationMaterielStatus {
    if (checked === 0) return 'not_started';
    if (missing > 0 && checked >= totalItems) return 'missing';
    if (checked < totalItems) return 'in_progress';
    return 'completed';
  }

  const materielsByMission = new Map<string, MissionVerificationMaterielSummary[]>();
  for (const assignment of materielAssignments ?? []) {
    const missionId = missionByRequirement.get(assignment.mission_required_materiel_id);
    if (!missionId) continue;

    const containerType = Array.isArray(assignment.materiel_type) ? assignment.materiel_type[0] : assignment.materiel_type;
    const totalItems = countLeafItems(assignment.materiel_type_id, new Set());
    const { checked, missing } = checkedByAssignment.get(assignment.id) ?? { checked: 0, missing: 0 };

    const list = materielsByMission.get(missionId) ?? [];
    list.push({
      mission_materiel_assignment_id: assignment.id,
      name: containerType?.name ?? 'Matériel',
      total_items: totalItems,
      checked_items: checked,
      status: computeMaterielStatus(totalItems, checked, missing)
    });
    materielsByMission.set(missionId, list);
  }

  const summaries: MissionVerificationSummary[] = missions.map((mission) => ({
    mission_id: mission.id,
    title: mission.title,
    category: missionTypeNameById.get(mission.mission_type_id) ?? 'Mission',
    starts_at: mission.starts_at,
    ends_at: mission.ends_at,
    location: mission.location,
    materiels: materielsByMission.get(mission.id) ?? []
  }));

  summaries.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  return NextResponse.json({ missions: summaries });
}
