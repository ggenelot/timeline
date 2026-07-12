import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';

export async function PATCH(req: NextRequest, { params }: { params: { id: string; contentId: string } }) {
  const auth = await requirePermission(req, 'materiel', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;
  const client = auth.serviceClient;

  const body = (await req.json()) as { quantity?: number; position?: number };
  const patch: Record<string, number> = {};
  if (body.quantity !== undefined) {
    if (body.quantity < 1) return NextResponse.json({ error: 'La quantité doit être un entier positif.' }, { status: 400 });
    patch.quantity = body.quantity;
  }
  if (body.position !== undefined) patch.position = body.position;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Aucune modification.' }, { status: 400 });
  }

  const { data, error } = await client
    .from('materiel_type_contents')
    .update(patch)
    .eq('id', params.contentId)
    .eq('parent_type_id', params.id)
    .select('*, child_type:materiel_types!materiel_type_contents_child_type_id_fkey(id, name, code, is_container)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ content: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; contentId: string } }) {
  const auth = await requirePermission(req, 'materiel', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;
  const client = auth.serviceClient;

  const { error } = await client
    .from('materiel_type_contents')
    .delete()
    .eq('id', params.contentId)
    .eq('parent_type_id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
