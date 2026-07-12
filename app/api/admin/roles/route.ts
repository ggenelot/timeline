import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'administration', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;

  const serviceClient = createServerSupabaseServiceClient();

  const { data: roles, error: rolesError } = await serviceClient
    .from('roles')
    .select('id,name,description,is_default,is_system,created_at')
    .order('name', { ascending: true });

  if (rolesError) return NextResponse.json({ error: rolesError.message }, { status: 500 });

  const { data: profileRoles, error: profileRolesError } = await serviceClient
    .from('profile_roles')
    .select('id,profile_id,role_id,created_at,profile:profiles(id,full_name,email)');

  if (profileRolesError) return NextResponse.json({ error: profileRolesError.message }, { status: 500 });

  const { data: roleBehaviors, error: behaviorsError } = await serviceClient
    .from('role_behaviors')
    .select('id,role_id,resource_type,behavior_type,mission_type_ids,mission_statuses,created_at');

  if (behaviorsError) return NextResponse.json({ error: behaviorsError.message }, { status: 500 });

  return NextResponse.json({
    roles: roles ?? [],
    profileRoles: profileRoles ?? [],
    roleBehaviors: roleBehaviors ?? []
  });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'administration', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
  };

  if (!body.name?.trim()) return NextResponse.json({ error: 'Le nom est obligatoire.' }, { status: 400 });

  const serviceClient = createServerSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from('roles')
    .insert({
      name: body.name.trim(),
      description: body.description?.trim() ?? null
    })
    .select('id,name,description,is_default,created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ role: data }, { status: 201 });
}
