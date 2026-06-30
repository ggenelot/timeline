import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';

export async function POST(request: NextRequest, { params }: { params: { missionId: string } }) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.client || !auth.user) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  const missionId = params.missionId;

  const { data: canVerify, error: canVerifyError } = await auth.client.rpc('can_verify_mission_materiel', {
    _mission_id: missionId,
    _user_id: auth.user.id
  });

  if (canVerifyError || !canVerify) {
    return NextResponse.json({ error: 'Accès refusé : vous n’êtes pas confirmé sur cette mission.' }, { status: 403 });
  }

  const { data: requiredMateriels, error: requiredError } = await auth.client
    .from('mission_required_materiels')
    .select('id,quantity,category:materiel_categories(name)')
    .eq('mission_id', missionId);

  if (requiredError) {
    return NextResponse.json({ error: requiredError.message }, { status: 400 });
  }

  const requirementIds = (requiredMateriels ?? []).map((row) => row.id);

  const { data: materielAssignments, error: materielAssignmentsError } =
    requirementIds.length > 0
      ? await auth.client
          .from('mission_materiel_assignments')
          .select('id,mission_required_materiel_id,materiel_type_id')
          .in('mission_required_materiel_id', requirementIds)
      : { data: [], error: null };

  if (materielAssignmentsError) {
    return NextResponse.json({ error: materielAssignmentsError.message }, { status: 400 });
  }

  const assignedCountByRequirement = new Map<string, number>();
  for (const row of materielAssignments ?? []) {
    assignedCountByRequirement.set(row.mission_required_materiel_id, (assignedCountByRequirement.get(row.mission_required_materiel_id) ?? 0) + 1);
  }

  const underAssigned = (requiredMateriels ?? []).filter((row) => (assignedCountByRequirement.get(row.id) ?? 0) < row.quantity);
  if (underAssigned.length > 0) {
    const names = underAssigned
      .map((row) => (Array.isArray(row.category) ? row.category[0] : row.category)?.name ?? 'Matériel')
      .join(', ');
    return NextResponse.json(
      { error: `Du matériel reste à affecter avant de terminer la vérification : ${names}.` },
      { status: 400 }
    );
  }

  // On charge tout l'arbre de composition car un contenant affecté peut contenir d'autres
  // contenants imbriqués : seuls les items terminaux (non-contenants) comptent comme "à vérifier".
  const { data: contents, error: contentsError } = await auth.client
    .from('materiel_type_contents')
    .select('parent_type_id,child_type_id,child_type:materiel_types!materiel_type_contents_child_type_id_fkey(is_container)');

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

  const totalExpected = (materielAssignments ?? []).reduce((sum, row) => sum + countLeafItems(row.materiel_type_id, new Set()), 0);

  const assignmentIds = (materielAssignments ?? []).map((row) => row.id);

  const { count: checkedCount, error: checkedError } =
    assignmentIds.length > 0
      ? await auth.client
          .from('mission_materiel_verification_items')
          .select('id', { count: 'exact', head: true })
          .in('mission_materiel_assignment_id', assignmentIds)
      : { count: 0, error: null };

  if (checkedError) {
    return NextResponse.json({ error: checkedError.message }, { status: 400 });
  }

  if ((checkedCount ?? 0) < totalExpected) {
    return NextResponse.json(
      { error: `Il reste ${totalExpected - (checkedCount ?? 0)} item(s) à vérifier avant de terminer.` },
      { status: 400 }
    );
  }

  const { data: verification, error: verificationFetchError } = await auth.client
    .from('mission_materiel_verifications')
    .select('id')
    .eq('mission_id', missionId)
    .maybeSingle<{ id: string }>();

  if (verificationFetchError) {
    return NextResponse.json({ error: verificationFetchError.message }, { status: 400 });
  }

  const completedAt = new Date().toISOString();

  if (!verification) {
    const { error: insertError } = await auth.client.from('mission_materiel_verifications').insert({
      mission_id: missionId,
      status: 'completed',
      completed_by: auth.user.id,
      completed_at: completedAt
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
  } else {
    const { error: updateError } = await auth.client
      .from('mission_materiel_verifications')
      .update({ status: 'completed', completed_by: auth.user.id, completed_at: completedAt, updated_at: completedAt })
      .eq('id', verification.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ message: 'Vérification terminée.' });
}
