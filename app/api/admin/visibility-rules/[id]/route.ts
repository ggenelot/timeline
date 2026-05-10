import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  if (auth.profile.role !== 'admin') return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    criterion_type?: string;
    criterion_id?: string;
    required_status?: string | null;
    is_active?: boolean;
  };

  if (body.name !== undefined && !body.name.trim()) {
    return NextResponse.json({ error: 'Le nom ne peut pas être vide.' }, { status: 400 });
  }
  if (body.criterion_type !== undefined && !['skill', 'aptitude'].includes(body.criterion_type)) {
    return NextResponse.json({ error: 'Le type de critère est invalide.' }, { status: 400 });
  }
  const validStatuses = ['proposed', 'closed', 'confirmed', 'cancelled'];
  if (body.required_status !== undefined && body.required_status !== null && !validStatuses.includes(body.required_status)) {
    return NextResponse.json({ error: 'Le statut requis est invalide.' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description.trim() || null;
  if (body.criterion_type !== undefined) updates.criterion_type = body.criterion_type;
  if (body.criterion_id !== undefined) updates.criterion_id = body.criterion_id;
  if (body.required_status !== undefined) updates.required_status = body.required_status ?? null;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const serviceClient = createServerSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from('mission_visibility_rules')
    .update(updates)
    .eq('id', params.id)
    .select('id,name,description,criterion_type,criterion_id,required_status,is_active,created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rule: data });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  if (auth.profile.role !== 'admin') return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const serviceClient = createServerSupabaseServiceClient();
  const { error } = await serviceClient
    .from('mission_visibility_rules')
    .delete()
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
