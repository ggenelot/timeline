import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { RoleBehaviorType } from '@/lib/types';

// POST: add a behavior to this role
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  if (auth.profile.role !== 'admin') return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    behavior_type?: RoleBehaviorType;
    mission_type_ids?: string[];
    mission_statuses?: string[];
  };

  const validBehaviorTypes: RoleBehaviorType[] = ['can_create', 'can_manage', 'required_for_visibility', 'auto_slack', 'can_see'];
  if (!body.behavior_type || !validBehaviorTypes.includes(body.behavior_type)) {
    return NextResponse.json({ error: 'behavior_type invalide.' }, { status: 400 });
  }

  const serviceClient = createServerSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from('role_behaviors')
    .insert({
      role_id: params.id,
      behavior_type: body.behavior_type,
      mission_type_ids: body.mission_type_ids ?? [],
      mission_statuses: body.mission_statuses ?? [],
    })
    .select('id,role_id,behavior_type,mission_type_ids,mission_statuses,created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ behavior: data }, { status: 201 });
}
