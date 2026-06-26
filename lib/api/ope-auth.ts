import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createServerSupabaseAnonClient,
  createServerSupabaseServiceClient,
} from '@/lib/supabase/server';

function getToken(req: NextRequest): string {
  const auth = req.headers.get('authorization') ?? '';
  return auth.replace(/^Bearer\s+/i, '').trim();
}

// Accès OPE : rôle global `admin`/`responsable` OU comportement `can_manage`
// sur la ressource `mission` (système de rôles fin). Renvoie un client service
// si autorisé, sinon une réponse d'erreur prête à retourner.
export async function authorizeOpe(
  req: NextRequest
): Promise<{ client: SupabaseClient | null; error: NextResponse | null }> {
  const token = getToken(req);
  if (!token) {
    return { client: null, error: NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }) };
  }

  const anonClient = createServerSupabaseAnonClient(token);
  const {
    data: { user },
    error: userError,
  } = await anonClient.auth.getUser(token);
  if (userError || !user) {
    return { client: null, error: NextResponse.json({ error: 'Session invalide.' }, { status: 401 }) };
  }

  const serviceClient = createServerSupabaseServiceClient();
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'admin' || profile?.role === 'responsable') {
    return { client: serviceClient, error: null };
  }

  const { data: canManage } = await serviceClient.rpc('has_role_behavior', {
    _user_id: user.id,
    _resource_type: 'mission',
    _behavior: 'can_manage',
  });

  if (!canManage) {
    return { client: null, error: NextResponse.json({ error: 'Non autorisé.' }, { status: 403 }) };
  }

  return { client: serviceClient, error: null };
}
