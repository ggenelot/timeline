import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'skill', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;
  const client = auth.serviceClient;

  const body = (await req.json()) as { name?: string; code?: string; description?: string; category_id?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: 'Le titre est obligatoire.' }, { status: 400 });
  if (!body.category_id) return NextResponse.json({ error: 'La catégorie est obligatoire.' }, { status: 400 });

  const { data: maxRow } = await client
    .from('skills')
    .select('display_order')
    .eq('category_id', body.category_id)
    .order('display_order', { ascending: false })
    .limit(1)
    .single();

  const nextOrder = (maxRow?.display_order ?? -1) + 1;

  const { data, error } = await client
    .from('skills')
    .insert({
      name,
      code: body.code?.trim() || null,
      description: body.description?.trim() || null,
      category_id: body.category_id,
      display_order: nextOrder,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ skill: data }, { status: 201 });
}
