import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseAnonClient, createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/api/permissions';

async function getToken(req: NextRequest): Promise<string> {
  const auth = req.headers.get('authorization') ?? '';
  return auth.replace(/^Bearer\s+/i, '').trim();
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
    .select('*, child_type:materiel_types!materiel_type_contents_child_type_id_fkey(id, name, code, is_container, category:materiel_categories(id, name, color))')
    .eq('parent_type_id', params.id)
    .order('position', { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ contents: data });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePermission(req, 'materiel', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;
  const client = auth.serviceClient;

  const body = (await req.json()) as { child_type_id?: string; quantity?: number };
  if (!body.child_type_id) return NextResponse.json({ error: 'Le type de matériel contenu est obligatoire.' }, { status: 400 });
  if (body.child_type_id === params.id) {
    return NextResponse.json({ error: 'Un type ne peut pas se contenir lui-même.' }, { status: 400 });
  }

  const { data: parentType } = await client!
    .from('materiel_types')
    .select('is_container')
    .eq('id', params.id)
    .single();

  if (!parentType?.is_container) {
    return NextResponse.json({ error: 'Seul un contenant peut recevoir du contenu.' }, { status: 400 });
  }

  const { data: edges } = await client!.from('materiel_type_contents').select('parent_type_id, child_type_id');
  const childrenByParent = new Map<string, string[]>();
  for (const edge of edges ?? []) {
    const list = childrenByParent.get(edge.parent_type_id) ?? [];
    list.push(edge.child_type_id);
    childrenByParent.set(edge.parent_type_id, list);
  }

  const queue = [body.child_type_id];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === params.id) {
      return NextResponse.json({ error: 'Cet ajout créerait un cycle de composition.' }, { status: 400 });
    }
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...(childrenByParent.get(current) ?? []));
  }

  const { data: maxRow } = await client!
    .from('materiel_type_contents')
    .select('position')
    .eq('parent_type_id', params.id)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const nextPosition = (maxRow?.position ?? -1) + 1;

  const { data, error: dbError } = await client!
    .from('materiel_type_contents')
    .insert({
      parent_type_id: params.id,
      child_type_id: body.child_type_id,
      quantity: body.quantity && body.quantity >= 1 ? body.quantity : 1,
      position: nextPosition,
    })
    .select('*, child_type:materiel_types!materiel_type_contents_child_type_id_fkey(id, name, code, is_container, category:materiel_categories(id, name, color))')
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ content: data }, { status: 201 });
}
