import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

const MISSION_TYPE_SELECT = `
  id,name,description,color,default_required_volunteers,default_start_time,default_end_time,created_at,
  required_skills:mission_type_required_skills(id,mission_type_id,skill_id,quantity,created_at,skill:skills(id,name,category))
`;

export async function GET(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  if (auth.profile.role !== 'admin') return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const serviceClient = createServerSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from('mission_types')
    .select(MISSION_TYPE_SELECT)
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ missionTypes: data ?? [] });
}

export async function POST(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  if (auth.profile.role !== 'admin') return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    color?: string | null;
    default_required_volunteers?: number;
    default_start_time?: string | null;
    default_end_time?: string | null;
    required_skills?: Array<{ skill_id: string; quantity: number }>;
  };

  const trimmedName = body.name?.trim() ?? '';
  if (!trimmedName) return NextResponse.json({ error: 'Le nom est obligatoire.' }, { status: 400 });

  const serviceClient = createServerSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from('mission_types')
    .insert({
      name: trimmedName,
      description: body.description?.trim() || null,
      color: body.color || null,
      default_required_volunteers: body.default_required_volunteers ?? 1,
      default_start_time: body.default_start_time || null,
      default_end_time: body.default_end_time || null,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.required_skills && body.required_skills.length > 0) {
    const skillRows = body.required_skills
      .filter((s) => s.skill_id && s.quantity >= 1)
      .map((s) => ({ mission_type_id: data.id, skill_id: s.skill_id, quantity: s.quantity }));
    if (skillRows.length > 0) {
      const { error: skillError } = await serviceClient.from('mission_type_required_skills').insert(skillRows);
      if (skillError) {
        await serviceClient.from('mission_types').delete().eq('id', data.id);
        return NextResponse.json({ error: skillError.message }, { status: 500 });
      }
    }
  }

  const { data: full, error: fetchError } = await serviceClient
    .from('mission_types')
    .select(MISSION_TYPE_SELECT)
    .eq('id', data.id)
    .single();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  return NextResponse.json({ missionType: full }, { status: 201 });
}
