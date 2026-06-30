import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { MissionMaterielVerificationStatus, MissionVerificationSummary } from '@/lib/types';

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
    .select('mission:missions(id,title,starts_at,location,status)')
    .eq('volunteer_id', auth.user.id)
    .eq('assignment_status', 'confirmed');

  if (assignmentsError) {
    return NextResponse.json({ error: assignmentsError.message }, { status: 400 });
  }

  type MissionRow = { id: string; title: string; starts_at: string; location: string | null; status: string };
  const missions = (assignments ?? [])
    .map((row) => (Array.isArray(row.mission) ? row.mission[0] : row.mission) as MissionRow | null)
    .filter((mission): mission is MissionRow => mission !== null && mission.status === 'confirmed');

  if (missions.length === 0) {
    return NextResponse.json({ missions: [] satisfies MissionVerificationSummary[] });
  }

  const missionIds = missions.map((mission) => mission.id);

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
          .select('id,mission_required_materiel_id,materiel_type_id')
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

  const totalItemsByMission = new Map<string, number>();
  for (const row of materielAssignments ?? []) {
    const missionId = missionByRequirement.get(row.mission_required_materiel_id);
    if (!missionId) continue;
    const current = totalItemsByMission.get(missionId) ?? 0;
    totalItemsByMission.set(missionId, current + countLeafItems(row.materiel_type_id, new Set()));
  }

  const assignmentIds = (materielAssignments ?? []).map((row) => row.id);

  const { data: checkedItems, error: checkedError } =
    assignmentIds.length > 0
      ? await auth.client
          .from('mission_materiel_verification_items')
          .select('mission_id,mission_materiel_assignment_id')
          .in('mission_materiel_assignment_id', assignmentIds)
      : { data: [], error: null };

  if (checkedError) {
    return NextResponse.json({ error: checkedError.message }, { status: 400 });
  }

  const checkedCountByMission = new Map<string, number>();
  for (const row of checkedItems ?? []) {
    checkedCountByMission.set(row.mission_id, (checkedCountByMission.get(row.mission_id) ?? 0) + 1);
  }

  const { data: verifications, error: verificationsError } = await auth.client
    .from('mission_materiel_verifications')
    .select('mission_id,status')
    .in('mission_id', missionIds);

  if (verificationsError) {
    return NextResponse.json({ error: verificationsError.message }, { status: 400 });
  }

  const statusByMission = new Map<string, MissionMaterielVerificationStatus>();
  for (const row of verifications ?? []) {
    statusByMission.set(row.mission_id, row.status as MissionMaterielVerificationStatus);
  }

  const summaries: MissionVerificationSummary[] = missions.map((mission) => ({
    mission_id: mission.id,
    title: mission.title,
    starts_at: mission.starts_at,
    location: mission.location,
    status: statusByMission.get(mission.id) ?? 'not_started',
    total_items: totalItemsByMission.get(mission.id) ?? 0,
    checked_items: checkedCountByMission.get(mission.id) ?? 0
  }));

  summaries.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  return NextResponse.json({ missions: summaries });
}
