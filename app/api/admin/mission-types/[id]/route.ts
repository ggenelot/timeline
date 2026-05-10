import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { MissionCategory, MISSION_CATEGORY_OPTIONS } from '@/lib/types';

const VALID_CATEGORIES = MISSION_CATEGORY_OPTIONS.map((o) => o.value);

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
    required_skills?: Array<{ skill_id: string; quantity: number }>;
  };

  const trimmedName = body.name?.trim() ?? '';
  if (!trimmedName) return NextResponse.json({ error: 'Le nom est obligatoire.' }, { status: 400 });

  const category = body.category ?? null;
  if (category && !VALID_CATEGORIES.includes(category as MissionCategory)) {
    return NextResponse.json({ error: 'Catégorie invalide.' }, { status: 400 });
  }

  const serviceClient = createServerSupabaseServiceClient();
  const { error: updateError } = await serviceClient
    .from('mission_types')
    .update({
      name: trimmedName,
      description: body.description?.trim() || null,
      category: category || null,
      default_required_volunteers: body.default_required_volunteers ?? 1,
      default_start_time: body.default_start_time || null,
      default_end_time: body.default_end_time || null,
    })
    .eq('id', params.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (body.required_skills !== undefined) {
    const { error: deleteError } = await serviceClient
      .from('mission_type_required_skills')
      .delete()
      .eq('mission_type_id', params.id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    const skillRows = body.required_skills
      .filter((s) => s.skill_id && s.quantity >= 1)
      .map((s) => ({ mission_type_id: params.id, skill_id: s.skill_id, quantity: s.quantity }));
    if (skillRows.length > 0) {
      const { error: skillError } = await serviceClient.from('mission_type_required_skills').insert(skillRows);
      if (skillError) return NextResponse.json({ error: skillError.message }, { status: 500 });
    }
  }

  const { data, error: fetchError } = await serviceClient
    .from('mission_types')
    .select(`
      id,name,description,category,default_required_volunteers,default_start_time,default_end_time,created_at,
      required_skills:mission_type_required_skills(id,mission_type_id,skill_id,quantity,created_at,skill:skills(id,name,category))
    `)
    .eq('id', params.id)
    .single();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

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
