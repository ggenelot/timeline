import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

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

  const body = (await request.json().catch(() => ({}))) as { category?: string; responsibility_id?: string };

  if (!body.category || !body.responsibility_id) {
    return NextResponse.json({ error: 'category et responsibility_id sont obligatoires.' }, { status: 400 });
  }

  const validCategories = ['maraude', 'garde', 'formation', 'vie_antenne', 'poste_de_secours'];
  if (!validCategories.includes(body.category)) {
    return NextResponse.json({ error: 'Catégorie invalide.' }, { status: 400 });
  }

  const serviceClient = createServerSupabaseServiceClient();

  const { data, error } = await serviceClient
    .from('mission_category_responsibilities')
    .insert({ category: body.category, responsibility_id: body.responsibility_id })
    .select('id,category,responsibility_id,created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Cette responsabilité est déjà associée à cette catégorie.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ mapping: data }, { status: 201 });
}
