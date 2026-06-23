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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const client = await getAdminClient(req);
  if (!client) return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });

  const body = (await req.json()) as {
    label?: string;
    color?: string;
    mark?: string;
    is_validating?: boolean;
    display_order?: number;
  };
  const patch: Record<string, unknown> = {};
  if (body.label !== undefined) patch.label = body.label.trim();
  if (body.color !== undefined) patch.color = body.color;
  if (body.mark !== undefined) patch.mark = body.mark.trim() || '✓';
  if (body.is_validating !== undefined) patch.is_validating = body.is_validating;
  if (body.display_order !== undefined) patch.display_order = body.display_order;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Aucune modification.' }, { status: 400 });
  }

  const { data, error } = await client
    .from('skill_statuses')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const client = await getAdminClient(req);
  if (!client) return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });

  const { data: target } = await client.from('skill_statuses').select('protected').eq('id', params.id).single();
  if (target?.protected) {
    return NextResponse.json({ error: 'Ce statut est protégé et ne peut pas être supprimé.' }, { status: 400 });
  }

  const { error } = await client.from('skill_statuses').delete().eq('id', params.id);
  if (error) {
    // Violation de la clé étrangère : le statut est encore utilisé par des bénévoles.
    if (error.code === '23503') {
      return NextResponse.json(
        { error: 'Ce statut est attribué à au moins un·e bénévole ; retirez-le avant de le supprimer.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
