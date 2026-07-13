import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

const MISSION_TYPES_SELECT = `
  id,name,description,default_required_volunteers,default_start_time,default_end_time,created_at,
  required_skills:mission_type_required_skills(id,mission_type_id,skill_id,quantity,created_at,skill:skills(id,name,category_id,display_order))
`;

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePermission(request, 'mission_type', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    default_required_volunteers?: number;
    default_start_time?: string | null;
    default_end_time?: string | null;
    required_skills?: Array<{ skill_id: string; quantity: number }>;
  };

  const trimmedName = body.name?.trim() ?? '';
  if (!trimmedName) return NextResponse.json({ error: 'Le nom est obligatoire.' }, { status: 400 });

  const serviceClient = createServerSupabaseServiceClient();
  const { error: updateError } = await serviceClient
    .from('mission_types')
    .update({
      name: trimmedName,
      description: body.description?.trim() || null,
      default_required_volunteers: body.default_required_volunteers ?? 1,
      default_start_time: body.default_start_time || null,
      default_end_time: body.default_end_time || null,
    })
    .eq('id', params.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (body.required_skills !== undefined) {
    const skillRows = body.required_skills
      .filter((s) => s.skill_id && s.quantity >= 1)
      .map((s) => ({ mission_type_id: params.id, skill_id: s.skill_id, quantity: s.quantity }));

    if (skillRows.length > 0) {
      const { error: upsertError } = await serviceClient
        .from('mission_type_required_skills')
        .upsert(skillRows, { onConflict: 'mission_type_id,skill_id' });
      if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

      const keepIds = skillRows.map((s) => s.skill_id);
      const { error: pruneError } = await serviceClient
        .from('mission_type_required_skills')
        .delete()
        .eq('mission_type_id', params.id)
        .not('skill_id', 'in', `(${keepIds.join(',')})`);
      if (pruneError) return NextResponse.json({ error: pruneError.message }, { status: 500 });
    } else {
      const { error: deleteError } = await serviceClient
        .from('mission_type_required_skills')
        .delete()
        .eq('mission_type_id', params.id);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
  }

  const { data, error: fetchError } = await serviceClient
    .from('mission_types')
    .select(MISSION_TYPES_SELECT)
    .eq('id', params.id)
    .single();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  return NextResponse.json({ missionType: data });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePermission(request, 'mission_type', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;

  const serviceClient = createServerSupabaseServiceClient();
  const { error } = await serviceClient.from('mission_types').delete().eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
