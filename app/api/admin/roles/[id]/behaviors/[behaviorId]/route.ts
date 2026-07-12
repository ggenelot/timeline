import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

// DELETE: remove a behavior from this role
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; behaviorId: string } }
) {
  const auth = await requirePermission(request, 'administration', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;

  const serviceClient = createServerSupabaseServiceClient();
  const { error } = await serviceClient
    .from('role_behaviors')
    .delete()
    .eq('id', params.behaviorId)
    .eq('role_id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
