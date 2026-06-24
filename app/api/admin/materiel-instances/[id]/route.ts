import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

const SELECT_WITH_RELATIONS =
  '*, materiel_type:materiel_types(id, name, code), status:materiel_instance_statuses(*)';

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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const client = await getAdminClient(req);
  if (!client) return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });

  const body = (await req.json()) as {
    label?: string;
    location?: string | null;
    status_id?: string;
    parent_instance_id?: string | null;
  };
  const patch: Record<string, unknown> = {};
  if (body.label !== undefined) patch.label = body.label.trim();
  if (body.location !== undefined) patch.location = body.location?.trim() || null;
  if (body.status_id !== undefined) patch.status_id = body.status_id;
  if (body.parent_instance_id !== undefined) patch.parent_instance_id = body.parent_instance_id;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Aucune modification.' }, { status: 400 });
  }

  if (patch.parent_instance_id === params.id) {
    return NextResponse.json({ error: 'Une instance ne peut pas se contenir elle-même.' }, { status: 400 });
  }

  const { data, error } = await client
    .from('materiel_instances')
    .update(patch)
    .eq('id', params.id)
    .select(SELECT_WITH_RELATIONS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ instance: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const client = await getAdminClient(req);
  if (!client) return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });

  const { error } = await client.from('materiel_instances').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
