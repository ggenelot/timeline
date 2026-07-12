import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { checkIsAdmin } from '@/lib/api/permissions';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import type { PermissionAction, PermissionEntry, PermissionResource, Role, RoleBehavior } from '@/lib/types';

const ALL_RESOURCES: PermissionResource[] = [
  'mission',
  'cursus',
  'materiel',
  'volunteer',
  'skill',
  'mission_type',
  'settings',
  'administration'
];
const ALL_ACTIONS: PermissionAction[] = ['can_see', 'can_create', 'can_manage'];

// Aplati les comportements en permissions consommables par le client :
// l'implication can_manage ⇒ can_see est résolue ici (même règle que la
// fonction SQL has_permission) ; les scopes type/statut ne portent que sur
// les missions.
function flattenPermissions(behaviors: RoleBehavior[], isAdmin: boolean): PermissionEntry[] {
  if (isAdmin) {
    return ALL_RESOURCES.flatMap((resource) =>
      ALL_ACTIONS.map((action) => ({ resource, action, mission_type_ids: [], mission_statuses: [] }))
    );
  }

  const entries: PermissionEntry[] = [];
  for (const behavior of behaviors) {
    if (behavior.behavior_type === 'can_see' || behavior.behavior_type === 'can_create' || behavior.behavior_type === 'can_manage') {
      entries.push({
        resource: behavior.resource_type,
        action: behavior.behavior_type,
        mission_type_ids: behavior.mission_type_ids ?? [],
        mission_statuses: behavior.mission_statuses ?? []
      });
    }
    if (behavior.behavior_type === 'can_manage') {
      entries.push({
        resource: behavior.resource_type,
        action: 'can_see',
        mission_type_ids: behavior.mission_type_ids ?? [],
        mission_statuses: behavior.mission_statuses ?? []
      });
    }
  }
  return entries;
}

export async function GET(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const serviceClient = createServerSupabaseServiceClient();

  const [isAdmin, { data, error }] = await Promise.all([
    checkIsAdmin(serviceClient, auth.profile.id),
    serviceClient
      .from('profile_roles')
      .select('id,role_id,created_at,role:roles(id,name,description,is_default,is_system,created_at)')
      .eq('profile_id', auth.profile.id)
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const roles = (data ?? [])
    .map((row) => {
      const role = Array.isArray(row.role) ? row.role[0] : row.role;
      return (role as Role | undefined) ?? null;
    })
    .filter((role): role is Role => Boolean(role));

  const roleIds = roles.map((role) => role.id);

  let behaviors: RoleBehavior[] = [];
  if (roleIds.length > 0) {
    const { data: behaviorRows, error: behaviorsError } = await serviceClient
      .from('role_behaviors')
      .select('id,role_id,resource_type,behavior_type,mission_type_ids,mission_statuses,created_at')
      .in('role_id', roleIds);

    if (behaviorsError) return NextResponse.json({ error: behaviorsError.message }, { status: 500 });
    behaviors = (behaviorRows ?? []) as RoleBehavior[];
  }

  return NextResponse.json({
    roles,
    behaviors,
    isAdmin,
    permissions: flattenPermissions(behaviors, isAdmin)
  });
}
