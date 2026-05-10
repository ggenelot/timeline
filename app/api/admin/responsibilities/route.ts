import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });
  }

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  if (auth.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  const serviceClient = createServerSupabaseServiceClient();

  const { data: responsibilities, error } = await serviceClient
    .from('responsibilities')
    .select('id,name,description,created_at')
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: holders } = await serviceClient
    .from('responsibility_holders')
    .select('id,responsibility_id,profile_id,created_at,profile:profiles(id,full_name,email,slack_user_id,slack_username)');

  const { data: categoryMappings } = await serviceClient
    .from('mission_category_responsibilities')
    .select('id,category,responsibility_id,created_at')
    .order('category', { ascending: true });

  return NextResponse.json({
    responsibilities: responsibilities ?? [],
    holders: holders ?? [],
    categoryMappings: categoryMappings ?? []
  });
}

export async function POST(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });
  }

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  if (auth.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { name?: string; description?: string };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Le nom est obligatoire.' }, { status: 400 });
  }

  const serviceClient = createServerSupabaseServiceClient();

  const { data, error } = await serviceClient
    .from('responsibilities')
    .insert({ name: body.name.trim(), description: body.description?.trim() ?? null })
    .select('id,name,description,created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ responsibility: data }, { status: 201 });
}
