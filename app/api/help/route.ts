import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const path = request.nextUrl.searchParams.get('path');
  if (!path) return NextResponse.json({ helpPage: null });

  const serviceClient = createServerSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from('help_pages')
    .select('id,page_path,title,content,created_at,updated_at')
    .eq('page_path', path)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ helpPage: data ?? null });
}
