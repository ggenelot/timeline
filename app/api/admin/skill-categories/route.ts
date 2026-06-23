import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseAnonClient, createServerSupabaseServiceClient } from '@/lib/supabase/server';

async function getToken(req: NextRequest): Promise<string> {
  const auth = req.headers.get('authorization') ?? '';
  return auth.replace(/^Bearer\s+/i, '').trim();
}

async function assertAdmin(req: NextRequest) {
  const token = await getToken(req);
  if (!token) return { client: null, error: NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }) };

  const anonClient = createServerSupabaseAnonClient(token);
  const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
  if (userError || !user) return { client: null, error: NextResponse.json({ error: 'Session invalide.' }, { status: 401 }) };

  const serviceClient = createServerSupabaseServiceClient();
  const { data: profile } = await serviceClient.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') return { client: null, error: NextResponse.json({ error: 'Non autorisé.' }, { status: 403 }) };

  return { client: serviceClient, error: null };
}

async function assertAuthenticated(req: NextRequest) {
  const token = await getToken(req);
  if (!token) return { client: null, error: NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }) };

  const anonClient = createServerSupabaseAnonClient(token);
  const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
  if (userError || !user) return { client: null, error: NextResponse.json({ error: 'Session invalide.' }, { status: 401 }) };

  return { client: createServerSupabaseServiceClient(), error: null };
}

export async function GET(req: NextRequest) {
  const { client, error } = await assertAuthenticated(req);
  if (error) return error;

  const { data, error: dbError } = await client!
    .from('skill_categories')
    .select('*, skills(id, name, code, description, display_order, category_id, created_at)')
    .order('display_order', { ascending: true })
    .order('display_order', { referencedTable: 'skills', ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ categories: data });
}

export async function POST(req: NextRequest) {
  const { client, error } = await assertAdmin(req);
  if (error) return error;

  const body = (await req.json()) as { name?: string; color?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: 'Le nom est obligatoire.' }, { status: 400 });

  const { data: maxRow } = await client!
    .from('skill_categories')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .single();

  const nextOrder = (maxRow?.display_order ?? -1) + 1;

  const { data, error: dbError } = await client!
    .from('skill_categories')
    .insert({ name, color: body.color ?? 'slate', display_order: nextOrder })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ category: data }, { status: 201 });
}
