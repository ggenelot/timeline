import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseAnonClient } from '@/lib/supabase/server';
import { RoleBehaviorResourceType, RoleBehaviorType } from '@/lib/types';

export function getBearerToken(request: NextRequest): string {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.replace('Bearer ', '').trim() : '';
}

export async function requireAuthenticatedUser(token: string) {
  const client = createServerSupabaseAnonClient(token);
  const {
    data: { user },
    error
  } = await client.auth.getUser(token);

  if (error || !user) {
    return {
      client: null,
      user: null,
      profile: null,
      errorResponse: NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 })
    };
  }

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id,role,email,full_name')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return {
      client: null,
      user: null,
      profile: null,
      errorResponse: NextResponse.json({ error: 'Profil utilisateur introuvable.' }, { status: 403 })
    };
  }

  return { client, user, profile, errorResponse: null };
}

export async function hasRoleBehavior(
  client: SupabaseClient,
  userId: string,
  resourceType: RoleBehaviorResourceType,
  behavior: RoleBehaviorType
): Promise<boolean> {
  const { data, error } = await client.rpc('has_role_behavior', {
    _user_id: userId,
    _resource_type: resourceType,
    _behavior: behavior
  });
  return !error && Boolean(data);
}
