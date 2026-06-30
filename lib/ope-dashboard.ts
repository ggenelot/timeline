import type { OpeAvailabilityEntry, OpeEngagedMateriel, OpeMission } from '@/lib/types';
import { missionDayKey } from '@/lib/mission-timeline';

// ── Détection des conflits d'engagement d'un secouriste ───────────
// Deux situations signalées :
//  - `sameDay`        : ≥2 activités le même jour
//  - `consecutiveDays`: activités sur deux jours qui se suivent (J et J+1)

export type ConflictInfo = {
  sameDay: string[]; // clés jour "AAAA-MM-JJ" avec ≥2 engagements
  consecutiveDays: Array<[string, string]>; // paires de jours consécutifs
  label: string; // texte d'infobulle prêt à afficher
};

function dayKeyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function nextDayKey(key: string): string {
  const date = dayKeyToDate(key);
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayKeyLabel(key: string): string {
  return dayKeyToDate(key).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

export function computeVolunteerConflicts(missions: OpeMission[]): Map<string, ConflictInfo> {
  // volunteer_id → (clé jour → nb d'engagements ce jour)
  const byVolunteer = new Map<string, Map<string, number>>();
  for (const mission of missions) {
    const day = missionDayKey(mission.starts_at);
    for (const member of mission.team) {
      let days = byVolunteer.get(member.volunteer_id);
      if (!days) {
        days = new Map();
        byVolunteer.set(member.volunteer_id, days);
      }
      days.set(day, (days.get(day) ?? 0) + 1);
    }
  }

  const result = new Map<string, ConflictInfo>();
  for (const [volunteerId, days] of byVolunteer) {
    const sameDay = [...days.entries()].filter(([, count]) => count >= 2).map(([day]) => day);

    const sortedDays = [...days.keys()].sort();
    const consecutiveDays: Array<[string, string]> = [];
    for (let i = 0; i < sortedDays.length - 1; i += 1) {
      if (nextDayKey(sortedDays[i]) === sortedDays[i + 1]) {
        consecutiveDays.push([sortedDays[i], sortedDays[i + 1]]);
      }
    }

    if (sameDay.length === 0 && consecutiveDays.length === 0) continue;

    const parts: string[] = [];
    for (const day of sameDay) parts.push(`${days.get(day)} activités le ${dayKeyLabel(day)}`);
    for (const [a, b] of consecutiveDays) parts.push(`engagé le ${dayKeyLabel(a)} et le ${dayKeyLabel(b)}`);

    result.set(volunteerId, { sameDay, consecutiveDays, label: parts.join(' · ') });
  }
  return result;
}

// ── Secouristes dispo mais NON retenus, par jour ──────────────────
// Pour un jour donné : les bénévoles disponibles (response='available') sur
// une mission de ce jour, qui ne sont retenus sur aucune mission de ce jour.
export function availableNotRetainedByDay(
  missions: OpeMission[],
  availability: OpeAvailabilityEntry[]
): Map<string, OpeAvailabilityEntry[]> {
  const dayByMission = new Map<string, string>();
  const retainedByDay = new Map<string, Set<string>>();
  for (const mission of missions) {
    const day = missionDayKey(mission.starts_at);
    dayByMission.set(mission.id, day);
    let retained = retainedByDay.get(day);
    if (!retained) {
      retained = new Set();
      retainedByDay.set(day, retained);
    }
    for (const member of mission.team) retained.add(member.volunteer_id);
  }

  const result = new Map<string, OpeAvailabilityEntry[]>();
  const seenByDay = new Map<string, Set<string>>();
  for (const entry of availability) {
    const day = dayByMission.get(entry.mission_id);
    if (!day) continue;
    if (retainedByDay.get(day)?.has(entry.volunteer_id)) continue;

    let seen = seenByDay.get(day);
    if (!seen) {
      seen = new Set();
      seenByDay.set(day, seen);
    }
    if (seen.has(entry.volunteer_id)) continue;
    seen.add(entry.volunteer_id);

    const list = result.get(day) ?? [];
    list.push(entry);
    result.set(day, list);
  }
  return result;
}

// ── Matériel engagé, par jour ─────────────────────────────────────
// Pour chaque jour : les contenants affectés à au moins une activité de ce
// jour, dédupliqués (un même contenant engagé sur deux activités le même jour
// n'est listé qu'une fois). La page en déduit ensuite "dispo" et "indispo" à
// partir du catalogue : indispo = contenant hors service non engagé ce jour,
// dispo = contenant disponible non engagé ce jour (précédence engagé > indispo > dispo).
export function engagedMaterielByDay(missions: OpeMission[]): Map<string, OpeEngagedMateriel[]> {
  const result = new Map<string, OpeEngagedMateriel[]>();
  const seenByDay = new Map<string, Set<string>>();
  for (const mission of missions) {
    if (mission.materiel.length === 0) continue;
    const day = missionDayKey(mission.starts_at);
    let list = result.get(day);
    if (!list) {
      list = [];
      result.set(day, list);
    }
    let seen = seenByDay.get(day);
    if (!seen) {
      seen = new Set();
      seenByDay.set(day, seen);
    }
    for (const m of mission.materiel) {
      if (seen.has(m.container_type_id)) continue;
      seen.add(m.container_type_id);
      list.push(m);
    }
  }
  return result;
}
