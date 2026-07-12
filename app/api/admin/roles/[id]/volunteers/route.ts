import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkIsAdmin, dbErrorResponse, requirePermission } from '@/lib/api/permissions';

// L'appartenance au rôle SYSTÈME ne se gère que par un admin système : un
// délégué `administration/can_manage` ne peut pas se promouvoir admin en
// s'ajoutant au rôle système (miroir de la RLS 20260712140000).
async function isSystemRole(client: SupabaseClient, roleId: string): Promise<boolean> {
  const { data } = await client.from('roles').select('is_system').eq('id', roleId).single();
  return Boolean(data?.is_system);
}

// PUT: assign a volunteer to this role
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePermission(request, 'administration', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;
  const serviceClient = auth.serviceClient;

  const body = (await request.json().catch(() => ({}))) as { profile_id?: string };
  if (!body.profile_id) return NextResponse.json({ error: 'profile_id obligatoire.' }, { status: 400 });

  if (await isSystemRole(serviceClient, params.id) && !(await checkIsAdmin(serviceClient, auth.user.id))) {
    return NextResponse.json({ error: 'Seul un administrateur système peut gérer les membres du rôle système.' }, { status: 403 });
  }

  const { error } = await serviceClient
    .from('profile_roles')
    .upsert({ profile_id: body.profile_id, role_id: params.id }, { onConflict: 'profile_id,role_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// DELETE: remove a volunteer from this role
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePermission(request, 'administration', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;
  const serviceClient = auth.serviceClient;

  const body = (await request.json().catch(() => ({}))) as { profile_id?: string };
  if (!body.profile_id) return NextResponse.json({ error: 'profile_id obligatoire.' }, { status: 400 });

  if (await isSystemRole(serviceClient, params.id) && !(await checkIsAdmin(serviceClient, auth.user.id))) {
    return NextResponse.json({ error: 'Seul un administrateur système peut gérer les membres du rôle système.' }, { status: 403 });
  }

  const { error } = await serviceClient
    .from('profile_roles')
    .delete()
    .eq('role_id', params.id)
    .eq('profile_id', body.profile_id);

  // « Impossible de retirer le dernier administrateur. » (trigger) → 409.
  if (error) return dbErrorResponse(error);

  return NextResponse.json({ success: true });
}
