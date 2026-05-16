import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  if (auth.profile.role !== 'admin') return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    is_default?: boolean;
  };

  if (!body.name?.trim()) return NextResponse.json({ error: 'Le nom est obligatoire.' }, { status: 400 });

  const serviceClient = createServerSupabaseServiceClient();

  // If setting this role as default, clear the previous default first
  if (body.is_default === true) {
    await serviceClient
      .from('roles')
      .update({ is_default: false })
      .eq('is_default', true)
      .neq('id', params.id);
  }

  const { data, error } = await serviceClient
    .from('roles')
    .update({
      name: body.name.trim(),
      description: body.description?.trim() ?? null,
      ...(body.is_default !== undefined ? { is_default: body.is_default } : {}),
    })
    .eq('id', params.id)
    .select('id,name,description,is_default,created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ role: data });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  if (auth.profile.role !== 'admin') return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const serviceClient = createServerSupabaseServiceClient();

  const { data: roleToDelete } = await serviceClient
    .from('roles')
    .select('is_default')
    .eq('id', params.id)
    .single();

  if (roleToDelete?.is_default) {
    return NextResponse.json({ error: 'Impossible de supprimer le rôle par défaut.' }, { status: 400 });
  }

  const { error } = await serviceClient.from('roles').delete().eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
