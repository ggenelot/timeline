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

const SELECT_WITH_RELATIONS =
  '*, materiel_type:materiel_types(id, name, code), status:materiel_instance_statuses(*)';

export async function GET(req: NextRequest) {
  const { client, error } = await assertAuthenticated(req);
  if (error) return error;

  const { data, error: dbError } = await client!
    .from('materiel_instances')
    .select(SELECT_WITH_RELATIONS)
    .order('created_at', { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ instances: data });
}

export async function POST(req: NextRequest) {
  const { client, error } = await assertAdmin(req);
  if (error) return error;

  const body = (await req.json()) as {
    materiel_type_id?: string;
    parent_instance_id?: string | null;
    label?: string;
    location?: string | null;
    status_id?: string;
  };

  const label = body.label?.trim();
  if (!label) return NextResponse.json({ error: 'Le libellé est obligatoire.' }, { status: 400 });
  if (!body.materiel_type_id) return NextResponse.json({ error: 'Le type de matériel est obligatoire.' }, { status: 400 });
  if (!body.status_id) return NextResponse.json({ error: 'Le statut est obligatoire.' }, { status: 400 });

  const { data, error: dbError } = await client!
    .from('materiel_instances')
    .insert({
      materiel_type_id: body.materiel_type_id,
      parent_instance_id: body.parent_instance_id ?? null,
      label,
      location: body.location?.trim() || null,
      status_id: body.status_id,
    })
    .select(SELECT_WITH_RELATIONS)
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ instance: data }, { status: 201 });
}
