import type { OpeAvailabilityEntry, OpeContainer, OpeMission, OpeSkill } from '@/lib/types';
import { missionDayKey } from '@/lib/mission-timeline';

// ── Sélection / glisser-déposer (état partagé UI du board) ─────────
// `label` : nom affiché dans la pastille de sélection flottante.
export type BoardSelection =
  | { kind: 'volunteer'; volunteerId: string; fromAssignmentId?: string; fromMissionId?: string; label: string }
  | { kind: 'container'; containerId: string; fromAssignmentId?: string; fromMissionId?: string; label: string };

export type VolunteerDragPayload = { kind: 'volunteer'; volunteerId: string; fromAssignmentId?: string; fromMissionId?: string };
export type ContainerDragPayload = { kind: 'container'; containerId: string; fromAssignmentId?: string; fromMissionId?: string };
export type BoardDragPayload = VolunteerDragPayload | ContainerDragPayload;

// Créneau ciblé par le picker (modale de choix) quand on touche un
// emplacement vide sans sélection préalable compatible.
export type BoardPickerTarget =
  | { kind: 'volunteer'; missionId: string; requiredSkillId: string; skillId: string | null; roleName: string }
  | { kind: 'container'; missionId: string; requirementId: string; categoryId: string | null; categoryName: string };

// ── Bénévoles disponibles par jour (pool du board) ─────────────────
// Comme lib/ope-dashboard.ts::availableNotRetainedByDay, mais chaque entrée
// conserve l'ensemble des missions du jour pour lesquelles le bénévole a une
// disponibilité déclarée (mission_proposals.response='available') : c'est ce
// qui détermine, côté RLS (can_select_volunteer_for_mission), sur quel
// créneau de mission il peut réellement être déposé.
export type BoardVolunteerCandidate = {
  volunteer_id: string;
  full_name: string | null;
  avatar_url: string | null;
  validatedSkills: OpeSkill[];
  eligibleMissionIds: Set<string>;
};

export function engagedVolunteerIdsByDay(missions: OpeMission[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const mission of missions) {
    const day = missionDayKey(mission.starts_at);
    let set = result.get(day);
    if (!set) {
      set = new Set();
      result.set(day, set);
    }
    for (const member of mission.team) set.add(member.volunteer_id);
  }
  return result;
}

export function volunteerPoolByDay(
  missions: OpeMission[],
  availability: OpeAvailabilityEntry[]
): Map<string, BoardVolunteerCandidate[]> {
  const dayByMission = new Map<string, string>();
  for (const mission of missions) dayByMission.set(mission.id, missionDayKey(mission.starts_at));

  const engagedByDay = engagedVolunteerIdsByDay(missions);
  const byDayAndVolunteer = new Map<string, Map<string, BoardVolunteerCandidate>>();

  for (const entry of availability) {
    const day = dayByMission.get(entry.mission_id);
    if (!day) continue;
    if (engagedByDay.get(day)?.has(entry.volunteer_id)) continue;

    let byVolunteer = byDayAndVolunteer.get(day);
    if (!byVolunteer) {
      byVolunteer = new Map();
      byDayAndVolunteer.set(day, byVolunteer);
    }
    const existing = byVolunteer.get(entry.volunteer_id);
    if (existing) {
      existing.eligibleMissionIds.add(entry.mission_id);
      continue;
    }
    byVolunteer.set(entry.volunteer_id, {
      volunteer_id: entry.volunteer_id,
      full_name: entry.full_name,
      avatar_url: entry.avatar_url,
      validatedSkills: entry.validatedSkills,
      eligibleMissionIds: new Set([entry.mission_id]),
    });
  }

  const result = new Map<string, BoardVolunteerCandidate[]>();
  for (const [day, byVolunteer] of byDayAndVolunteer) result.set(day, [...byVolunteer.values()]);
  return result;
}

export function isVolunteerEligibleForMission(
  volunteerId: string,
  missionId: string,
  availability: OpeAvailabilityEntry[]
): boolean {
  return availability.some((a) => a.volunteer_id === volunteerId && a.mission_id === missionId);
}

// ── Matériel disponible par jour (pool du board) ───────────────────
// dispo = contenant disponible non engagé ce jour, indispo = hors service non
// engagé ce jour (même précédence que lib/ope-dashboard.ts::engagedMaterielByDay,
// dont on réutilise ici les engagements calculés côté page).
export function materielPoolByDay(
  missions: OpeMission[],
  containers: OpeContainer[]
): Map<string, { available: OpeContainer[]; unavailable: OpeContainer[] }> {
  const engagedByDay = new Map<string, Set<string>>();
  for (const mission of missions) {
    if (mission.materiel.length === 0) continue;
    const day = missionDayKey(mission.starts_at);
    let set = engagedByDay.get(day);
    if (!set) {
      set = new Set();
      engagedByDay.set(day, set);
    }
    for (const m of mission.materiel) set.add(m.container_type_id);
  }

  const days = new Set(missions.map((m) => missionDayKey(m.starts_at)));
  const result = new Map<string, { available: OpeContainer[]; unavailable: OpeContainer[] }>();
  for (const day of days) {
    const engaged = engagedByDay.get(day) ?? new Set<string>();
    result.set(day, {
      available: containers.filter((c) => c.is_available && !engaged.has(c.id)),
      unavailable: containers.filter((c) => !c.is_available && !engaged.has(c.id)),
    });
  }
  return result;
}

// ── Créneaux de rôle (bénévoles) d'une mission ─────────────────────
export type BoardRoleSlotFilled = {
  filled: true;
  assignment_id: string;
  volunteer_id: string;
  full_name: string | null;
  avatar_url: string | null;
  mismatch: boolean;
};
export type BoardRoleSlotEmpty = { filled: false };
export type BoardRoleSlot = BoardRoleSlotFilled | BoardRoleSlotEmpty;

export type BoardRole = {
  requiredSkillId: string;
  skillId: string | null;
  name: string;
  qty: number;
  filled: number;
  slots: BoardRoleSlot[];
};

export function buildRoleSlots(mission: OpeMission): BoardRole[] {
  return mission.requiredSkills.map((rs) => {
    const members = mission.team.filter((m) => m.required_skill_id === rs.id);
    const slots: BoardRoleSlot[] = [];
    for (let i = 0; i < rs.quantity; i += 1) {
      const member = members[i];
      slots.push(
        member
          ? {
              filled: true,
              assignment_id: member.assignment_id,
              volunteer_id: member.volunteer_id,
              full_name: member.full_name,
              avatar_url: member.avatar_url,
              mismatch: rs.skill ? !member.validatedSkills.some((s) => s.id === rs.skill!.id) : false,
            }
          : { filled: false }
      );
    }
    return {
      requiredSkillId: rs.id,
      skillId: rs.skill?.id ?? null,
      name: rs.skill?.name ?? 'Bénévole',
      qty: rs.quantity,
      filled: members.length,
      slots,
    };
  });
}

// ── Créneaux de matériel d'une mission ──────────────────────────────
export type BoardMaterielSlotFilled = {
  filled: true;
  assignment_id: string;
  materiel_type_id: string;
  name: string;
  code: string | null;
};
export type BoardMaterielSlotEmpty = { filled: false };
export type BoardMaterielSlot = BoardMaterielSlotFilled | BoardMaterielSlotEmpty;

export type BoardMaterielRequirement = {
  requirementId: string;
  categoryId: string | null;
  name: string;
  qty: number;
  filled: number;
  slots: BoardMaterielSlot[];
};

export function buildMaterielSlots(mission: OpeMission): BoardMaterielRequirement[] {
  return mission.requiredMateriels.map((req) => {
    const slots: BoardMaterielSlot[] = [];
    for (let i = 0; i < req.quantity; i += 1) {
      const assignment = req.assignments[i];
      slots.push(
        assignment
          ? { filled: true, assignment_id: assignment.id, materiel_type_id: assignment.materiel_type_id, name: assignment.name, code: assignment.code }
          : { filled: false }
      );
    }
    return {
      requirementId: req.id,
      categoryId: req.category?.id ?? null,
      name: req.category?.name ?? 'Matériel',
      qty: req.quantity,
      filled: req.assignments.length,
      slots,
    };
  });
}
