import { supabase } from '@/lib/supabase/client';

export type MissionBoardActionResult = { ok: true } | { ok: false; error: string };

// Affecte un bénévole à un créneau de rôle (mission_required_skill_id, ou
// `null` pour un créneau générique). `fromAssignmentId` : si le bénévole
// venait d'un autre créneau/mission (déplacement plutôt que dépôt depuis le
// pool), on désaffecte d'abord — sinon la contrainte unique (mission,
// bénévole) ou can_select_volunteer_for_mission peut rejeter l'insertion.
export async function assignVolunteerToMission(params: {
  missionId: string;
  volunteerId: string;
  requiredSkillId: string | null;
  fromAssignmentId?: string;
}): Promise<MissionBoardActionResult> {
  if (params.fromAssignmentId) {
    const { error } = await supabase.from('mission_assignments').delete().eq('id', params.fromAssignmentId);
    if (error) return { ok: false, error: error.message };
  }
  const { error } = await supabase.from('mission_assignments').insert({
    mission_id: params.missionId,
    volunteer_id: params.volunteerId,
    mission_required_skill_id: params.requiredSkillId,
    assignment_status: 'selected',
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unassignVolunteerFromMission(assignmentId: string): Promise<MissionBoardActionResult> {
  const { error } = await supabase.from('mission_assignments').delete().eq('id', assignmentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function assignMaterielToMission(params: {
  requirementId: string;
  containerId: string;
  fromAssignmentId?: string;
}): Promise<MissionBoardActionResult> {
  if (params.fromAssignmentId) {
    const { error } = await supabase.from('mission_materiel_assignments').delete().eq('id', params.fromAssignmentId);
    if (error) return { ok: false, error: error.message };
  }
  const { error } = await supabase
    .from('mission_materiel_assignments')
    .insert({ mission_required_materiel_id: params.requirementId, materiel_type_id: params.containerId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unassignMaterielFromMission(assignmentId: string): Promise<MissionBoardActionResult> {
  const { error } = await supabase.from('mission_materiel_assignments').delete().eq('id', assignmentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
