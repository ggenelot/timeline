import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

async function getAdminClient(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const serviceClient = createServerSupabaseServiceClient();
  const { data: { user }, error } = await serviceClient.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await serviceClient.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') return null;

  return serviceClient;
}

export async function POST(req: NextRequest) {
  const client = await getAdminClient(req);
  if (!client) return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });

  const body = (await req.json()) as { name?: string; code?: string; description?: string; category_id?: string; is_container?: boolean };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: 'Le nom est obligatoire.' }, { status: 400 });
  if (!body.category_id) return NextResponse.json({ error: 'La catégorie est obligatoire.' }, { status: 400 });

  const { data: maxRow } = await client
    .from('materiel_types')
    .select('display_order')
    .eq('category_id', body.category_id)
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
      category_id: body.category_id,
      is_container: body.is_container ?? false,
      display_order: nextOrder,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ type: data }, { status: 201 });
}
