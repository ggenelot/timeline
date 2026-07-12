import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePermission(req, 'materiel', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;
  const client = auth.serviceClient;

  const body = (await req.json()) as { name?: string; color?: string; display_order?: number };
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.color !== undefined) patch.color = body.color;
  if (body.display_order !== undefined) patch.display_order = body.display_order;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Aucune modification.' }, { status: 400 });
  }

  const { data, error } = await client
    .from('materiel_categories')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ category: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePermission(req, 'materiel', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;
  const client = auth.serviceClient;

  const { error } = await client.from('materiel_categories').delete().eq('id', params.id);
  if (error) {
    if (error.code === '23503') {
      return NextResponse.json({ error: 'Ce type de matériel est utilisé par du matériel requis sur au moins une mission ou un gabarit de mission. Retirez-le de ces besoins avant de le supprimer.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
