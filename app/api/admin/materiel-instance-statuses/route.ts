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

function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'statut'
  );
}

export async function GET(req: NextRequest) {
  const { client, error } = await assertAuthenticated(req);
  if (error) return error;

  const { data, error: dbError } = await client!
    .from('materiel_instance_statuses')
    .select('*')
    .order('display_order', { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ statuses: data });
}

export async function POST(req: NextRequest) {
  const { client, error } = await assertAdmin(req);
  if (error) return error;

  const body = (await req.json()) as { label?: string; color?: string; is_available?: boolean };
  const label = body.label?.trim();
  if (!label) return NextResponse.json({ error: 'Le libellé est obligatoire.' }, { status: 400 });

  const { data: maxRow } = await client!
    .from('materiel_instance_statuses')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .single();
  const nextOrder = (maxRow?.display_order ?? -1) + 1;

  let key = slugify(label);
  const { data: existing } = await client!.from('materiel_instance_statuses').select('key').like('key', `${key}%`);
  if ((existing ?? []).some((row) => row.key === key)) {
    let i = 2;
    while ((existing ?? []).some((row) => row.key === `${key}_${i}`)) i++;
    key = `${key}_${i}`;
  }

  const { data, error: dbError } = await client!
    .from('materiel_instance_statuses')
    .insert({
      key,
      label,
      color: body.color ?? 'slate',
      is_available: body.is_available ?? true,
      display_order: nextOrder,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ status: data }, { status: 201 });
}
