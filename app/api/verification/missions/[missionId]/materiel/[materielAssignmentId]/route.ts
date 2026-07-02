import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { MissionVerificationTree, VerificationTreeContainerNode, VerificationTreeNode } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { missionId: string; materielAssignmentId: string } }
) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.client || !auth.user) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  const { missionId, materielAssignmentId } = params;

  const { data: canVerify, error: canVerifyError } = await auth.client.rpc('can_verify_mission_materiel', {
    _mission_id: missionId,
    _user_id: auth.user.id
  });

  if (canVerifyError || !canVerify) {
    return NextResponse.json({ error: 'Accès refusé : vous n’êtes pas confirmé sur cette mission.' }, { status: 403 });
  }

  const { data: mission, error: missionError } = await auth.client
    .from('missions')
    .select('id,title')
    .eq('id', missionId)
    .maybeSingle<{ id: string; title: string }>();

  if (missionError) {
    return NextResponse.json({ error: missionError.message }, { status: 400 });
  }
  if (!mission) {
    return NextResponse.json({ error: 'Mission introuvable.' }, { status: 404 });
  }

  const { data: assignment, error: assignmentError } = await auth.client
    .from('mission_materiel_assignments')
    .select('id,materiel_type_id,mission_required_materiel_id,materiel_type:materiel_types(id,name),mission_required_materiel:mission_required_materiels!inner(mission_id)')
    .eq('id', materielAssignmentId)
    .eq('mission_required_materiel.mission_id', missionId)
    .maybeSingle<{
      id: string;
      materiel_type_id: string;
      materiel_type: { id: string; name: string } | { id: string; name: string }[] | null;
    }>();

  if (assignmentError) {
    return NextResponse.json({ error: assignmentError.message }, { status: 400 });
  }
  if (!assignment) {
    return NextResponse.json({ error: 'Matériel affecté introuvable pour cette mission.' }, { status: 404 });
  }

  // On charge tout l'arbre de composition (pas seulement les enfants directs du
  // contenant affecté) car il peut lui-même contenir d'autres contenants imbriqués.
  const { data: contents, error: contentsError } = await auth.client
    .from('materiel_type_contents')
    .select('parent_type_id,child_type_id,quantity,position,child_type:materiel_types!materiel_type_contents_child_type_id_fkey(id,name,is_container)')
    .order('position', { ascending: true });

  if (contentsError) {
    return NextResponse.json({ error: contentsError.message }, { status: 400 });
  }

  const { data: existingItems, error: itemsError } = await auth.client
    .from('mission_materiel_verification_items')
    .select('child_type_id,status,note,quantity_present')
    .eq('mission_materiel_assignment_id', materielAssignmentId);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 400 });
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

  const checksByChildType = new Map<string, { status: string; note: string | null; quantity_present: number | null }>();
  for (const item of existingItems ?? []) {
    checksByChildType.set(item.child_type_id, { status: item.status, note: item.note, quantity_present: item.quantity_present });
  }

  function sumLeaves(nodes: VerificationTreeNode[]) {
    let total = 0;
    let checked = 0;
    let missing = 0;
    for (const node of nodes) {
      if (node.kind === 'item') {
        total += 1;
        if (node.check) {
          checked += 1;
          if (node.check.status === 'missing' || node.check.status === 'partial') missing += 1;
        }
      } else {
        total += node.totalItems;
        checked += node.checkedItems;
        missing += node.missingItems;
      }
    }
    return { total, checked, missing };
  }

  // multiplier : produit des quantités des contenants ancêtres (ex. 2 poches
  // contenant chacune 5 compresses → l'item terminal attend 10 compresses),
  // même logique que collectLeafItems dans la route de détail existante.
  function buildNode(typeId: string, name: string, path: string, visited: Set<string>, multiplier: number): VerificationTreeContainerNode {
    const nextVisited = new Set(visited).add(typeId);
    const children = contentsByContainer.get(typeId) ?? [];

    const childNodes: VerificationTreeNode[] = children
      .filter((content) => !nextVisited.has(content.child_type_id))
      .map((content) => {
        const childType = Array.isArray(content.child_type) ? content.child_type[0] : content.child_type;
        const childName = childType?.name ?? 'Item';
        const childPath = `${path}>${content.child_type_id}`;
        const childQuantity = multiplier * content.quantity;

        if (childType?.is_container) {
          return buildNode(content.child_type_id, childName, childPath, nextVisited, childQuantity);
        }

        const check = checksByChildType.get(content.child_type_id) ?? null;
        return {
          kind: 'item',
          id: childPath,
          child_type_id: content.child_type_id,
          name: childName,
          quantity: childQuantity,
          check: check
            ? { status: check.status as 'present' | 'partial' | 'missing', note: check.note, quantity_present: check.quantity_present }
            : null
        } satisfies VerificationTreeNode;
      });

    const totals = sumLeaves(childNodes);

    return {
      kind: 'container',
      id: path,
      materiel_type_id: typeId,
      name,
      children: childNodes,
      totalItems: totals.total,
      checkedItems: totals.checked,
      missingItems: totals.missing
    };
  }

  const rootType = Array.isArray(assignment.materiel_type) ? assignment.materiel_type[0] : assignment.materiel_type;
  const root = buildNode(assignment.materiel_type_id, rootType?.name ?? 'Matériel', 'root', new Set(), 1);

  const tree: MissionVerificationTree = {
    mission_id: missionId,
    mission_title: mission.title,
    assignment_id: materielAssignmentId,
    root
  };

  return NextResponse.json(tree);
}
