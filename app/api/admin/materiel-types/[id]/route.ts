import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePermission(req, 'materiel', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;
  const client = auth.serviceClient;

  const body = (await req.json()) as {
    name?: string;
    code?: string;
    description?: string;
    display_order?: number;
    is_container?: boolean;
    category_id?: string | null;
    is_available?: boolean;
    unavailable_reason?: string | null;
  };
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.code !== undefined) patch.code = body.code.trim() || null;
  if (body.description !== undefined) patch.description = body.description.trim() || null;
  if (body.display_order !== undefined) patch.display_order = body.display_order;
  if (body.is_container !== undefined) patch.is_container = body.is_container;
  if (body.category_id !== undefined) patch.category_id = body.category_id || null;
  if (body.is_available !== undefined) patch.is_available = body.is_available;
  if (body.unavailable_reason !== undefined) {
    patch.unavailable_reason = body.unavailable_reason?.trim() || null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Aucune modification.' }, { status: 400 });
  }

  const { data, error } = await client
    .from('materiel_types')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ type: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePermission(req, 'materiel', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;
  const client = auth.serviceClient;

  const { error } = await client.from('materiel_types').delete().eq('id', params.id);
  if (error) {
    if (error.code === '23503') {
      return NextResponse.json({ error: 'Impossible de supprimer ce contenant : il est affecté à une mission. Retirez-le de la mission avant de le supprimer.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
