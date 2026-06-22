import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const serviceClient = createServerSupabaseServiceClient();

  const { data, error } = await serviceClient
    .from('profile_roles')
    .select('id,role_id,created_at,role:roles(id,name,description,created_at)')
    .eq('profile_id', auth.profile.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const roleIds = (data ?? []).map((row) => {
    const role = Array.isArray(row.role) ? row.role[0] : row.role;
    return role?.id;
  }).filter(Boolean) as string[];

  const roles = (data ?? []).map((row) => {
    const role = Array.isArray(row.role) ? row.role[0] : row.role;
    return role ?? null;
  }).filter(Boolean);

  if (roleIds.length === 0) {
    return NextResponse.json({ roles: [], behaviors: [] });
  }

  const { data: behaviors, error: behaviorsError } = await serviceClient
    .from('role_behaviors')
    .select('id,role_id,resource_type,behavior_type,mission_type_ids,mission_statuses,created_at')
    .in('role_id', roleIds);

  if (behaviorsError) return NextResponse.json({ error: behaviorsError.message }, { status: 500 });

  return NextResponse.json({ roles, behaviors: behaviors ?? [] });
}
