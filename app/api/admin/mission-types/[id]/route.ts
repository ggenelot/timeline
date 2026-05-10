import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { ALLOWED_MISSION_TYPE_NAMES, MISSION_TYPE_NAME_TO_CATEGORY } from '@/lib/types';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  if (auth.profile.role !== 'admin') return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    category?: string | null;
    default_required_volunteers?: number;
    default_start_time?: string | null;
    default_end_time?: string | null;
  };

  const trimmedName = body.name?.trim() ?? '';
  if (!trimmedName) return NextResponse.json({ error: 'Le nom est obligatoire.' }, { status: 400 });
  if (!ALLOWED_MISSION_TYPE_NAMES.includes(trimmedName)) {
    return NextResponse.json({ error: `Type de mission non reconnu. Valeurs autorisées : ${ALLOWED_MISSION_TYPE_NAMES.join(', ')}.` }, { status: 400 });
  }

  const serviceClient = createServerSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from('mission_types')
    .update({
      name: trimmedName,
      description: body.description?.trim() || null,
      category: MISSION_TYPE_NAME_TO_CATEGORY[trimmedName],
      default_required_volunteers: body.default_required_volunteers ?? 1,
      default_start_time: body.default_start_time || null,
      default_end_time: body.default_end_time || null,
    })
    .eq('id', params.id)
    .select('id,name,description,category,default_required_volunteers,default_start_time,default_end_time,created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ missionType: data });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  if (auth.profile.role !== 'admin') return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const serviceClient = createServerSupabaseServiceClient();
  const { error } = await serviceClient.from('mission_types').delete().eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
