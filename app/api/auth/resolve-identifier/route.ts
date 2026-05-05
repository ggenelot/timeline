import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

type ResolveIdentifierPayload = {
  identifier?: string;
};

export async function POST(request: NextRequest) {
  let payload: ResolveIdentifierPayload;

  try {
    payload = (await request.json()) as ResolveIdentifierPayload;
  } catch {
    return NextResponse.json({ error: 'Le corps de la requête est invalide.' }, { status: 400 });
  }

  const identifier = payload.identifier?.trim().toLowerCase() ?? '';
  if (!identifier) {
    return NextResponse.json({ error: 'Identifiant requis.' }, { status: 400 });
  }

  const serviceClient = createServerSupabaseServiceClient();
  const { data: profile, error } = await serviceClient
    .from('profiles')
    .select('email')
    .eq('identifier', identifier)
    .maybeSingle<{ email: string }>();

  if (error) {
    return NextResponse.json({ error: 'Impossible de vérifier cet identifiant.' }, { status: 500 });
  }

  return NextResponse.json({ email: profile?.email ?? null });
}
