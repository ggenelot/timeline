import { supabase } from '@/lib/supabase/client';
import type { MissionVolunteerCandidate } from '@/lib/mission-board';

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

// Rend un bénévole disponible sur une mission précise (upsert mission_proposals
// + notification Slack), exactement comme le bouton admin de la fiche mission —
// réutilisé ici pour débloquer une affectation depuis le board quand le
// bénévole n'a pas encore de disponibilité déclarée sur cette mission. Route
// réservée aux admins (assertAdmin côté serveur) : mêmes garde-fous que
// l'écriture directe RLS sur mission_proposals pour un rôle admin.
export async function markVolunteerAvailableForMission(
  token: string,
  missionId: string,
  volunteerId: string
): Promise<MissionBoardActionResult> {
  const res = await fetch(`/api/admin/missions/${missionId}/volunteers`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ volunteer_id: volunteerId, response: 'available' }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: json.error ?? "Impossible de rendre ce bénévole disponible pour cette mission." };
  }
  return { ok: true };
}

export type MissionVolunteerCandidatesResult = { ok: true; candidates: MissionVolunteerCandidate[] } | { ok: false; error: string };

// Répertoire complet des bénévoles + leur réponse sur CETTE mission (dispo /
// indispo / sans réponse), pour la recherche "chercher parmi tous les
// bénévoles" du board — au-delà des seuls dispo/engagés ce jour-là. Route
// admin-only (assertAdmin), cohérent avec markVolunteerAvailableForMission
// qui est le seul débouché utile pour un candidat sans disponibilité ici.
export async function fetchMissionVolunteerCandidates(token: string, missionId: string): Promise<MissionVolunteerCandidatesResult> {
  const res = await fetch(`/api/admin/missions/${missionId}/volunteers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: json.error ?? 'Impossible de charger la liste des bénévoles.' };
  }
  const json = (await res.json()) as {
    proposals: Array<{ volunteer_id: string; response: 'available' | 'unavailable' | 'no_response' }>;
    volunteers: Array<{ id: string; full_name: string | null; avatar_url: string | null; validatedSkillIds: string[] }>;
  };
  const responseByVolunteerId = new Map(json.proposals.map((p) => [p.volunteer_id, p.response]));
  const candidates: MissionVolunteerCandidate[] = json.volunteers.map((v) => ({
    id: v.id,
    full_name: v.full_name,
    avatar_url: v.avatar_url,
    response: responseByVolunteerId.get(v.id) ?? 'no_response',
    validatedSkillIds: v.validatedSkillIds,
  }));
  return { ok: true, candidates };
}
