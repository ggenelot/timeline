import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });
  }

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  if (auth.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { profile_id?: string };

  if (!body.profile_id) {
    return NextResponse.json({ error: 'profile_id obligatoire.' }, { status: 400 });
  }

  const serviceClient = createServerSupabaseServiceClient();

  const { data, error } = await serviceClient
    .from('responsibility_holders')
    .upsert(
      { responsibility_id: params.id, profile_id: body.profile_id },
      { onConflict: 'responsibility_id' }
    )
    .select('id,responsibility_id,profile_id,created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ holder: data });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });
  }

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  if (auth.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  const serviceClient = createServerSupabaseServiceClient();

  const { error } = await serviceClient
    .from('responsibility_holders')
    .delete()
    .eq('responsibility_id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
