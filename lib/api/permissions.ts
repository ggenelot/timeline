import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createServerSupabaseAnonClient, createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { getBearerToken } from '@/lib/api/auth';
import type { PermissionAction, PermissionResource } from '@/lib/types';

// Couche d'autorisation unique des routes API (pattern service-role : le
// client service bypasse la RLS, donc ce check est la SEULE garde de ces
// routes). Remplace progressivement les checks inline `profile.role !== 'admin'`.
//
// La décision est déléguée aux fonctions SQL has_permission() /
// can_manage_mission() — mêmes fonctions que les policies RLS, un seul chemin
// de vérité. L'admin (membre du rôle système) est implicitement autorisé.

type AuthorizeSuccess = { user: User; serviceClient: SupabaseClient; errorResponse: null };
type AuthorizeFailure = { user: null; serviceClient: null; errorResponse: NextResponse };
export type AuthorizeResult = AuthorizeSuccess | AuthorizeFailure;

function unauthorized(message: string, status: 401 | 403): AuthorizeFailure {
  return {
    user: null,
    serviceClient: null,
    errorResponse: NextResponse.json({ error: message }, { status })
  };
}

async function authenticate(request: NextRequest): Promise<AuthorizeSuccess | AuthorizeFailure> {
  const token = getBearerToken(request);
  if (!token) return unauthorized('Non authentifié.', 401);

  const anonClient = createServerSupabaseAnonClient(token);
  const {
    data: { user },
    error
  } = await anonClient.auth.getUser(token);
  if (error || !user) return unauthorized('Session invalide. Veuillez vous reconnecter.', 401);

  return { user, serviceClient: createServerSupabaseServiceClient(), errorResponse: null };
}

/**
 * Autorise la requête si l'utilisateur détient l'action sur la ressource
 * (ou est administrateur). Insensible au scoping mission (type/statut) :
 * pour une décision par mission, utiliser requireMissionPermission.
 */
export async function requirePermission(
  request: NextRequest,
  resource: PermissionResource,
  action: PermissionAction
): Promise<AuthorizeResult> {
  const auth = await authenticate(request);
  if (auth.errorResponse) return auth;

  const { data: allowed, error } = await auth.serviceClient.rpc('has_permission', {
    _user_id: auth.user.id,
    _resource: resource,
    _action: action
  });

  if (error || !allowed) return unauthorized('Non autorisé.', 403);
  return auth;
}

/**
 * Autorise la requête si l'utilisateur peut gérer CETTE mission (admin,
 * créateur, ou can_manage couvrant son type) — via can_manage_mission, la
 * même fonction que la RLS du domaine mission.
 */
export async function requireMissionPermission(
  request: NextRequest,
  missionId: string
): Promise<AuthorizeResult> {
  const auth = await authenticate(request);
  if (auth.errorResponse) return auth;

  const { data: allowed, error } = await auth.serviceClient.rpc('can_manage_mission', {
    _mission_id: missionId,
    _user_id: auth.user.id
  });

  if (error || !allowed) return unauthorized('Non autorisé.', 403);
  return auth;
}

/**
 * Autorise la requête uniquement pour un administrateur système. Réservé aux
 * opérations « super-pouvoir » qui bypassent la RLS de façon transverse (ex.
 * import bulk de missions tous types confondus) et ne doivent donc pas
 * s'appuyer sur une permission de domaine scopée.
 */
export async function requireAdmin(request: NextRequest): Promise<AuthorizeResult> {
  const auth = await authenticate(request);
  if (auth.errorResponse) return auth;

  const { data: admin, error } = await auth.serviceClient.rpc('is_admin', { _user_id: auth.user.id });
  if (error || !admin) return unauthorized('Réservé aux administrateurs.', 403);
  return auth;
}

/** Vérifie une permission pour un utilisateur déjà authentifié. */
export async function checkPermission(
  serviceClient: SupabaseClient,
  userId: string,
  resource: PermissionResource,
  action: PermissionAction
): Promise<boolean> {
  const { data, error } = await serviceClient.rpc('has_permission', {
    _user_id: userId,
    _resource: resource,
    _action: action
  });
  return !error && Boolean(data);
}

/**
 * Traduit une erreur Postgres en réponse HTTP : les `raise exception` des
 * triggers garde-fous (rôle système protégé, dernier admin…) portent des
 * messages en français destinés à l'utilisateur → 409, le reste → 500.
 */
export function dbErrorResponse(error: { code?: string; message: string }): NextResponse {
  const status = error.code === 'P0001' ? 409 : 500;
  return NextResponse.json({ error: error.message }, { status });
}

/** Vérifie l'appartenance au rôle système (administrateur). */
export async function checkIsAdmin(serviceClient: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await serviceClient.rpc('is_admin', { _user_id: userId });
  return !error && Boolean(data);
}
