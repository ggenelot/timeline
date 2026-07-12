import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePermission(req, 'skill', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;
  const client = auth.serviceClient;

  const body = (await req.json()) as { name?: string; code?: string; description?: string; display_order?: number };
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.code !== undefined) patch.code = body.code.trim() || null;
  if (body.description !== undefined) patch.description = body.description.trim() || null;
  if (body.display_order !== undefined) patch.display_order = body.display_order;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Aucune modification.' }, { status: 400 });
  }

  const { data, error } = await client
    .from('skills')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ skill: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePermission(req, 'skill', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;
  const client = auth.serviceClient;

  const { error } = await client.from('skills').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
