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

export async function GET(req: NextRequest) {
  const { client, error } = await assertAuthenticated(req);
  if (error) return error;

  const kind = req.nextUrl.searchParams.get('kind');
  const q = req.nextUrl.searchParams.get('q')?.trim();

  if (kind === 'roots') {
    const { data: childIds } = await client!.from('materiel_type_contents').select('child_type_id');
    const excluded = Array.from(new Set((childIds ?? []).map((row) => row.child_type_id)));

    let query = client!.from('materiel_types').select('*, category:materiel_categories(id, name, color)').eq('is_container', true).order('display_order', { ascending: true });
    if (excluded.length > 0) query = query.not('id', 'in', `(${excluded.join(',')})`);

    const { data, error: dbError } = await query;
    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
    return NextResponse.json({ types: data });
  }

  if (kind === 'items') {
    let query = client!.from('materiel_types').select('*').eq('is_container', false).order('name', { ascending: true });
    if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%,description.ilike.%${q}%`);

    const { data, error: dbError } = await query;
    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

    const ids = (data ?? []).map((t) => t.id);
    const containersByItem = new Map<string, string[]>();
    if (ids.length > 0) {
      const { data: edges } = await client!
        .from('materiel_type_contents')
        .select('child_type_id, parent_type:materiel_types!materiel_type_contents_parent_type_id_fkey(name)')
        .in('child_type_id', ids);
      for (const edge of edges ?? []) {
        const parentType = Array.isArray(edge.parent_type) ? edge.parent_type[0] : edge.parent_type;
        const list = containersByItem.get(edge.child_type_id) ?? [];
        if (parentType?.name) list.push(parentType.name);
        containersByItem.set(edge.child_type_id, list);
      }
    }

    const types = (data ?? []).map((t) => ({ ...t, containers: containersByItem.get(t.id) ?? [] }));
    return NextResponse.json({ types });
  }

  const { data, error: dbError } = await client!.from('materiel_types').select('*').order('display_order', { ascending: true });
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ types: data });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'materiel', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;
  const client = auth.serviceClient;

  const body = (await req.json()) as { name?: string; code?: string; description?: string; category_id?: string; is_container?: boolean };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: 'Le nom est obligatoire.' }, { status: 400 });

  const { data: maxRow } = await client
    .from('materiel_types')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .single();

  const nextOrder = (maxRow?.display_order ?? -1) + 1;

  const { data, error } = await client
    .from('materiel_types')
    .insert({
      name,
      code: body.code?.trim() || null,
      description: body.description?.trim() || null,
      category_id: body.category_id || null,
      is_container: body.is_container ?? false,
      display_order: nextOrder,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ type: data }, { status: 201 });
}
