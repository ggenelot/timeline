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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { client, error } = await assertAuthenticated(req);
  if (error) return error;

  const { data, error: dbError } = await client!
    .from('materiel_type_contents')
    .select('*, child_type:materiel_types!materiel_type_contents_child_type_id_fkey(id, name, code)')
    .eq('parent_type_id', params.id)
    .order('created_at', { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ contents: data });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { client, error } = await assertAdmin(req);
  if (error) return error;

  const body = (await req.json()) as { child_type_id?: string; quantity?: number };
  if (!body.child_type_id) return NextResponse.json({ error: 'Le type de matériel contenu est obligatoire.' }, { status: 400 });
  if (body.child_type_id === params.id) {
    return NextResponse.json({ error: 'Un type ne peut pas se contenir lui-même.' }, { status: 400 });
  }

  const { data, error: dbError } = await client!
    .from('materiel_type_contents')
    .insert({
      parent_type_id: params.id,
      child_type_id: body.child_type_id,
      quantity: body.quantity && body.quantity >= 1 ? body.quantity : 1,
    })
    .select('*, child_type:materiel_types!materiel_type_contents_child_type_id_fkey(id, name, code)')
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ content: data }, { status: 201 });
}
