import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  if (auth.profile.role !== 'admin') return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const serviceClient = createServerSupabaseServiceClient();

  const { data: rules, error } = await serviceClient
    .from('mission_visibility_rules')
    .select('id,name,description,criterion_type,criterion_id,required_status,is_active,created_at')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch skills and aptitudes for display
  const [{ data: skills }, { data: aptitudes }] = await Promise.all([
    serviceClient.from('skills').select('id,name,category').order('name', { ascending: true }),
    serviceClient.from('aptitudes').select('id,name').order('name', { ascending: true })
  ]);

  return NextResponse.json({
    rules: rules ?? [],
    skills: skills ?? [],
    aptitudes: aptitudes ?? []
  });
}

export async function POST(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  if (auth.profile.role !== 'admin') return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    criterion_type?: string;
    criterion_id?: string;
    required_status?: string | null;
    is_active?: boolean;
  };

  if (!body.name?.trim()) return NextResponse.json({ error: 'Le nom est obligatoire.' }, { status: 400 });
  if (!body.criterion_type || !['skill', 'aptitude'].includes(body.criterion_type)) {
    return NextResponse.json({ error: 'Le type de critère est invalide.' }, { status: 400 });
  }
  if (!body.criterion_id) return NextResponse.json({ error: 'Le critère est obligatoire.' }, { status: 400 });
  const validStatuses = ['proposed', 'closed', 'confirmed', 'cancelled'];
  if (body.required_status !== undefined && body.required_status !== null && !validStatuses.includes(body.required_status)) {
    return NextResponse.json({ error: 'Le statut requis est invalide.' }, { status: 400 });
  }

  const serviceClient = createServerSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from('mission_visibility_rules')
    .insert({
      name: body.name.trim(),
      description: body.description?.trim() ?? null,
      criterion_type: body.criterion_type,
      criterion_id: body.criterion_id,
      required_status: body.required_status ?? null,
      is_active: body.is_active ?? true
    })
    .select('id,name,description,criterion_type,criterion_id,required_status,is_active,created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rule: data }, { status: 201 });
}
