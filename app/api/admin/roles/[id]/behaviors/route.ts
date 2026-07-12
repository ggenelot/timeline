import { NextRequest, NextResponse } from 'next/server';
import { dbErrorResponse, requirePermission } from '@/lib/api/permissions';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { RoleBehaviorResourceType, RoleBehaviorType } from '@/lib/types';

// Actions valides par ressource (même règle que la contrainte SQL
// role_behaviors_action_per_resource_check) : hors mission, seulement les
// trois actions génériques, sans scoping type/statut.
const MISSION_BEHAVIORS: RoleBehaviorType[] = ['can_see', 'can_create', 'can_manage', 'required_for_visibility', 'auto_slack'];
const GENERIC_BEHAVIORS: RoleBehaviorType[] = ['can_see', 'can_create', 'can_manage'];

const VALID_BEHAVIORS_BY_RESOURCE: Record<RoleBehaviorResourceType, RoleBehaviorType[]> = {
  mission: MISSION_BEHAVIORS,
  cursus: GENERIC_BEHAVIORS,
  materiel: GENERIC_BEHAVIORS,
  volunteer: GENERIC_BEHAVIORS,
  skill: GENERIC_BEHAVIORS,
  mission_type: GENERIC_BEHAVIORS,
  settings: GENERIC_BEHAVIORS,
  administration: GENERIC_BEHAVIORS,
};

// POST: add a behavior to this role
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePermission(request, 'administration', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;

  const body = (await request.json().catch(() => ({}))) as {
    behavior_type?: RoleBehaviorType;
    resource_type?: RoleBehaviorResourceType;
    mission_type_ids?: string[];
    mission_statuses?: string[];
  };

  const resourceType: RoleBehaviorResourceType = body.resource_type ?? 'mission';
  const validBehaviors = VALID_BEHAVIORS_BY_RESOURCE[resourceType];
  if (!validBehaviors) {
    return NextResponse.json({ error: 'resource_type invalide.' }, { status: 400 });
  }
  if (!body.behavior_type || !validBehaviors.includes(body.behavior_type)) {
    return NextResponse.json({ error: 'behavior_type invalide pour cette ressource.' }, { status: 400 });
  }

  const serviceClient = createServerSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from('role_behaviors')
    .insert({
      role_id: params.id,
      behavior_type: body.behavior_type,
      resource_type: resourceType,
      mission_type_ids: resourceType === 'mission' ? (body.mission_type_ids ?? []) : [],
      mission_statuses: resourceType === 'mission' ? (body.mission_statuses ?? []) : [],
    })
    .select('id,role_id,resource_type,behavior_type,mission_type_ids,mission_statuses,created_at')
    .single();

  if (error) return dbErrorResponse(error);

  return NextResponse.json({ behavior: data }, { status: 201 });
}
