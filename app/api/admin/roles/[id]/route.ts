import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { dbErrorResponse } from '@/lib/api/permissions';
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

  // Le rôle système est figé côté DB (trigger) : seule sa description est
  // modifiable, on n'envoie donc pas les champs verrouillés.
  const { data: existing } = await serviceClient
    .from('roles')
    .select('is_system')
    .eq('id', params.id)
    .single();

  const updatePayload = existing?.is_system
    ? { description: body.description?.trim() ?? null }
    : {
        name: body.name.trim(),
        description: body.description?.trim() ?? null,
        ...(body.is_default !== undefined ? { is_default: body.is_default } : {}),
      };

  const { data, error } = await serviceClient
    .from('roles')
    .update(updatePayload)
    .eq('id', params.id)
    .select('id,name,description,is_default,is_system,created_at')
    .single();

  if (error) return dbErrorResponse(error);

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
    .select('is_default,is_system')
    .eq('id', params.id)
    .single();

  if (roleToDelete?.is_default) {
    return NextResponse.json({ error: 'Impossible de supprimer le rôle par défaut.' }, { status: 400 });
  }
  if (roleToDelete?.is_system) {
    return NextResponse.json({ error: 'Le rôle système ne peut pas être supprimé.' }, { status: 409 });
  }

  const { error } = await serviceClient.from('roles').delete().eq('id', params.id);

  if (error) return dbErrorResponse(error);

  return NextResponse.json({ success: true });
}
