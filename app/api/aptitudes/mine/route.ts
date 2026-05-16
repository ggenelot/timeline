import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

// Returns the aptitudes of the currently authenticated user
export async function GET(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const serviceClient = createServerSupabaseServiceClient();

  const { data, error } = await serviceClient
    .from('profile_aptitudes')
    .select('id,aptitude_id,created_at,aptitude:aptitudes(id,name,description,allowed_mission_type_ids)')
    .eq('profile_id', auth.profile.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const aptitudes = (data ?? []).map((row) => {
    const aptitude = Array.isArray(row.aptitude) ? row.aptitude[0] : row.aptitude;
    return aptitude ?? null;
  }).filter(Boolean);

  return NextResponse.json({ aptitudes });
}
