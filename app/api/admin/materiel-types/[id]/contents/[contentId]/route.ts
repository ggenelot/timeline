import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

async function getAdminClient(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const serviceClient = createServerSupabaseServiceClient();
  const { data: { user }, error } = await serviceClient.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await serviceClient.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') return null;

  return serviceClient;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; contentId: string } }) {
  const client = await getAdminClient(req);
  if (!client) return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });

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
    .select('*, child_type:materiel_types!materiel_type_contents_child_type_id_fkey(id, name, is_container)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ content: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; contentId: string } }) {
  const client = await getAdminClient(req);
  if (!client) return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });

  const { error } = await client
    .from('materiel_type_contents')
    .delete()
    .eq('id', params.contentId)
    .eq('parent_type_id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
