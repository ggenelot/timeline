import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
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

  const body = (await request.json().catch(() => ({}))) as { mission_type_id?: string; responsibility_id?: string };

  if (!body.mission_type_id || !body.responsibility_id) {
    return NextResponse.json({ error: 'mission_type_id et responsibility_id sont obligatoires.' }, { status: 400 });
  }

  const serviceClient = createServerSupabaseServiceClient();

  const { data: mt } = await serviceClient.from('mission_types').select('id').eq('id', body.mission_type_id).single();
  if (!mt) {
    return NextResponse.json({ error: 'Type de mission introuvable.' }, { status: 400 });
  }

  const { data, error } = await serviceClient
    .from('mission_category_responsibilities')
    .insert({ mission_type_id: body.mission_type_id, responsibility_id: body.responsibility_id })
    .select('id,mission_type_id,responsibility_id,created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Cette responsabilité est déjà associée à ce type de mission.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ mapping: data }, { status: 201 });
}
