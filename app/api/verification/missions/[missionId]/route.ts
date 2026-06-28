import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { MissionMaterielVerification, MissionMaterielVerificationItem, MissionVerificationCard, MissionVerificationDetail } from '@/lib/types';

export async function GET(request: NextRequest, { params }: { params: { missionId: string } }) {
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
    .select('id,materiel_type_id,quantity,materiel_type:materiel_types(id,name)')
    .eq('mission_id', missionId);

  if (requiredError) {
    return NextResponse.json({ error: requiredError.message }, { status: 400 });
  }

  // On charge tout l'arbre de composition (pas seulement les enfants directs des contenants
  // requis) car un contenant requis peut lui-même contenir d'autres contenants imbriqués.
  const { data: contents, error: contentsError } = await auth.client
    .from('materiel_type_contents')
    .select('parent_type_id,child_type_id,quantity,position,child_type:materiel_types!materiel_type_contents_child_type_id_fkey(id,name,is_container)')
    .order('position', { ascending: true });

  if (contentsError) {
    return NextResponse.json({ error: contentsError.message }, { status: 400 });
  }

  const { data: existingItems, error: itemsError } = await auth.client
    .from('mission_materiel_verification_items')
    .select('id,mission_id,mission_required_materiel_id,occurrence_index,child_type_id,status,note,checked_by,checked_at')
    .eq('mission_id', missionId);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 400 });
  }

  const { data: verification, error: verificationError } = await auth.client
    .from('mission_materiel_verifications')
    .select('id,mission_id,status,completed_by,completed_at,created_at,updated_at')
    .eq('mission_id', missionId)
    .maybeSingle<MissionMaterielVerification>();

  if (verificationError) {
    return NextResponse.json({ error: verificationError.message }, { status: 400 });
  }

  type ContentRow = {
    parent_type_id: string;
    child_type_id: string;
    quantity: number;
    position: number;
    child_type: { id: string; name: string; is_container: boolean } | { id: string; name: string; is_container: boolean }[] | null;
  };

  const contentsByContainer = new Map<string, ContentRow[]>();
  for (const row of (contents ?? []) as ContentRow[]) {
    const list = contentsByContainer.get(row.parent_type_id) ?? [];
    list.push(row);
    contentsByContainer.set(row.parent_type_id, list);
  }

  const checksByKey = new Map<string, MissionMaterielVerificationItem>();
  for (const item of (existingItems ?? []) as MissionMaterielVerificationItem[]) {
    checksByKey.set(`${item.mission_required_materiel_id}:${item.occurrence_index}:${item.child_type_id}`, item);
  }

  type LeafItem = { childTypeId: string; label: string; expectedQuantity: number };

  // Descend récursivement la composition d'un contenant jusqu'aux items terminaux (non-contenants),
  // en cumulant les quantités le long du chemin et en préfixant le nom par les contenants imbriqués traversés.
  function collectLeafItems(containerTypeId: string, nestedPath: string[], multiplier: number, visited: Set<string>): LeafItem[] {
    if (visited.has(containerTypeId)) return [];
    const nextVisited = new Set(visited).add(containerTypeId);
    const children = contentsByContainer.get(containerTypeId) ?? [];
    const leaves: LeafItem[] = [];

    for (const content of children) {
      const childType = Array.isArray(content.child_type) ? content.child_type[0] : content.child_type;
      const childName = childType?.name ?? 'Item';
      const childQuantity = multiplier * content.quantity;

      if (childType?.is_container) {
        leaves.push(...collectLeafItems(content.child_type_id, [...nestedPath, childName], childQuantity, nextVisited));
      } else {
        const label = nestedPath.length > 0 ? `${nestedPath.join(' > ')} — ${childName}` : childName;
        leaves.push({ childTypeId: content.child_type_id, label, expectedQuantity: childQuantity });
      }
    }

    return leaves;
  }

  const cards: MissionVerificationCard[] = [];

  for (const requirement of requiredMateriels ?? []) {
    const containerType = Array.isArray(requirement.materiel_type) ? requirement.materiel_type[0] : requirement.materiel_type;
    const containerName = containerType?.name ?? 'Contenant';
    const leafItems = collectLeafItems(requirement.materiel_type_id, [], 1, new Set());

    for (let occurrenceIndex = 0; occurrenceIndex < requirement.quantity; occurrenceIndex += 1) {
      for (const leaf of leafItems) {
        const check = checksByKey.get(`${requirement.id}:${occurrenceIndex}:${leaf.childTypeId}`) ?? null;

        cards.push({
          mission_required_materiel_id: requirement.id,
          container_type_id: requirement.materiel_type_id,
          container_name: containerName,
          occurrence_index: occurrenceIndex,
          occurrence_count: requirement.quantity,
          child_type_id: leaf.childTypeId,
          child_name: leaf.label,
          expected_quantity: leaf.expectedQuantity,
          check: check ? { status: check.status, note: check.note } : null
        });
      }
    }
  }

  const detail: MissionVerificationDetail = {
    mission_id: missionId,
    verification: verification ?? null,
    cards
  };

  return NextResponse.json(detail);
}
