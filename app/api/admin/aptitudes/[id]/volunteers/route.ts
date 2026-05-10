import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

// PUT: assign a volunteer to this aptitude
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  if (auth.profile.role !== 'admin') return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { profile_id?: string };
  if (!body.profile_id) return NextResponse.json({ error: 'profile_id obligatoire.' }, { status: 400 });

  const serviceClient = createServerSupabaseServiceClient();
  const { error } = await serviceClient
    .from('profile_aptitudes')
    .upsert({ profile_id: body.profile_id, aptitude_id: params.id }, { onConflict: 'profile_id,aptitude_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// DELETE: remove a volunteer from this aptitude
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  if (auth.profile.role !== 'admin') return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { profile_id?: string };
  if (!body.profile_id) return NextResponse.json({ error: 'profile_id obligatoire.' }, { status: 400 });

  const serviceClient = createServerSupabaseServiceClient();
  const { error } = await serviceClient
    .from('profile_aptitudes')
    .delete()
    .eq('aptitude_id', params.id)
    .eq('profile_id', body.profile_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
