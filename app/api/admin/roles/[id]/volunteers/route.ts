import { NextRequest, NextResponse } from 'next/server';
import { dbErrorResponse, requirePermission } from '@/lib/api/permissions';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

// PUT: assign a volunteer to this role
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePermission(request, 'administration', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;

  const body = (await request.json().catch(() => ({}))) as { profile_id?: string };
  if (!body.profile_id) return NextResponse.json({ error: 'profile_id obligatoire.' }, { status: 400 });

  const serviceClient = createServerSupabaseServiceClient();
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

  const body = (await request.json().catch(() => ({}))) as { profile_id?: string };
  if (!body.profile_id) return NextResponse.json({ error: 'profile_id obligatoire.' }, { status: 400 });

  const serviceClient = createServerSupabaseServiceClient();
  const { error } = await serviceClient
    .from('profile_roles')
    .delete()
    .eq('role_id', params.id)
    .eq('profile_id', body.profile_id);

  // « Impossible de retirer le dernier administrateur. » (trigger) → 409.
  if (error) return dbErrorResponse(error);

  return NextResponse.json({ success: true });
}
