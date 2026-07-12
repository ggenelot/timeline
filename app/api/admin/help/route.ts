import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'settings', 'can_see');
  if (auth.errorResponse) return auth.errorResponse;

  const serviceClient = createServerSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from('help_pages')
    .select('id,page_path,title,content,created_at,updated_at')
    .order('page_path', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ helpPages: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'settings', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;

  const body = (await request.json().catch(() => ({}))) as {
    page_path?: string;
    title?: string;
    content?: string;
  };

  if (!body.page_path?.trim()) return NextResponse.json({ error: 'Le chemin de page est obligatoire.' }, { status: 400 });
  if (!body.title?.trim()) return NextResponse.json({ error: 'Le titre est obligatoire.' }, { status: 400 });

  const serviceClient = createServerSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from('help_pages')
    .insert({
      page_path: body.page_path.trim(),
      title: body.title.trim(),
      content: body.content?.trim() ?? '',
    })
    .select('id,page_path,title,content,created_at,updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ helpPage: data }, { status: 201 });
}
