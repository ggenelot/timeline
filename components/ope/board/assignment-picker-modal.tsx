'use client';

import type { OpeAvailabilityEntry, OpeContainer, OpeMission } from '@/lib/types';
import type { BoardPickerTarget, BoardVolunteerCandidate } from '@/lib/mission-board';
import { isVolunteerEligibleForMission } from '@/lib/mission-board';
import { missionDayKey } from '@/lib/mission-timeline';
import { Avatar } from '@/components/ope/atoms';
import { Modal } from '@/components/ui/modal';

type PickerRow = { id: string; name: string; avatarUrl?: string | null; sub: string; onClick: () => void };

// Modale « touche un emplacement vide » : liste les candidats pour un
// créneau donné, groupés comme sur la maquette — dispo non affectés d'abord,
// puis ceux déjà engagés ce jour-là sur une autre mission (proposition de
// déplacement). Un candidat n'apparaît que s'il peut réellement être déposé
// sur CETTE mission (mission_proposals.response='available' pour elle —
// contrainte RLS can_select_volunteer_for_mission), pas seulement ce jour-là.
export function AssignmentPickerModal({
  target,
  missions,
  availability,
  volunteerPool,
  materielPool,
  onClose,
  onPickVolunteer,
  onPickContainer,
}: {
  target: BoardPickerTarget;
  missions: OpeMission[];
  availability: OpeAvailabilityEntry[];
  volunteerPool: Map<string, BoardVolunteerCandidate[]>;
  materielPool: Map<string, { available: OpeContainer[]; unavailable: OpeContainer[] }>;
  onClose: () => void;
  onPickVolunteer: (volunteerId: string, fromAssignmentId?: string) => void;
  onPickContainer: (containerId: string, fromAssignmentId?: string) => void;
}) {
  const mission = missions.find((m) => m.id === target.missionId);
  const day = mission ? missionDayKey(mission.starts_at) : null;
  const title = target.kind === 'volunteer' ? target.roleName : target.categoryName;

  const groups: Array<{ label: string; items: PickerRow[] }> = [];

  if (target.kind === 'volunteer') {
    const relevantSkillId = target.skillId;
    const matchesSkill = (c: BoardVolunteerCandidate) => !relevantSkillId || c.validatedSkills.some((s) => s.id === relevantSkillId);

    const dayPool = day ? volunteerPool.get(day) ?? [] : [];
    const group1: PickerRow[] = dayPool
      .filter((c) => c.eligibleMissionIds.has(target.missionId) && matchesSkill(c))
      .map((c) => ({
        id: c.volunteer_id,
        name: c.full_name ?? 'Bénévole',
        avatarUrl: c.avatar_url,
        sub: 'Disponible',
        onClick: () => onPickVolunteer(c.volunteer_id),
      }));

    const seen = new Set<string>();
    const group2: PickerRow[] = [];
    for (const m of missions) {
      if (m.id === target.missionId || missionDayKey(m.starts_at) !== day) continue;
      for (const member of m.team) {
        if (seen.has(member.volunteer_id)) continue;
        if (!isVolunteerEligibleForMission(member.volunteer_id, target.missionId, availability)) continue;
        if (relevantSkillId && !member.validatedSkills.some((s) => s.id === relevantSkillId)) continue;
        seen.add(member.volunteer_id);
        group2.push({
          id: member.volunteer_id,
          name: member.full_name ?? 'Bénévole',
          avatarUrl: member.avatar_url,
          sub: `${m.type.name ?? 'Mission'}${m.location ? ' (' + m.location + ')' : ''}`,
          onClick: () => onPickVolunteer(member.volunteer_id, member.assignment_id),
        });
      }
    }

    if (group1.length > 0) groups.push({ label: 'Disponibles non affectés', items: group1 });
    if (group2.length > 0) groups.push({ label: 'Affectés le même jour, sur une autre mission', items: group2 });
  } else {
    const relevantCategoryId = target.categoryId;
    const dayPool = day ? materielPool.get(day) : undefined;
    const group1: PickerRow[] = (dayPool?.available ?? [])
      .filter((c) => !relevantCategoryId || c.category?.id === relevantCategoryId)
      .map((c) => ({
        id: c.id,
        name: c.code ? `${c.name} · ${c.code}` : c.name,
        sub: 'Disponible',
        onClick: () => onPickContainer(c.id),
      }));

    const seen = new Set<string>();
    const group2: PickerRow[] = [];
    for (const m of missions) {
      if (m.id === target.missionId || missionDayKey(m.starts_at) !== day) continue;
      for (const req of m.requiredMateriels) {
        if (relevantCategoryId && req.category?.id !== relevantCategoryId) continue;
        for (const a of req.assignments) {
          if (seen.has(a.materiel_type_id)) continue;
          seen.add(a.materiel_type_id);
          group2.push({
            id: a.materiel_type_id,
            name: a.code ? `${a.name} · ${a.code}` : a.name,
            sub: `${m.type.name ?? 'Mission'}${m.location ? ' (' + m.location + ')' : ''}`,
            onClick: () => onPickContainer(a.materiel_type_id, a.id),
          });
        }
      }
    }

    if (group1.length > 0) groups.push({ label: 'Disponibles non affectés', items: group1 });
    if (group2.length > 0) groups.push({ label: 'Affectés le même jour, sur une autre mission', items: group2 });
  }

  return (
    <Modal onClose={onClose} title={title} maxWidth={420}>
      {groups.length === 0 ? (
        <p className="py-3 text-[13px] text-ink-3">Aucun profil correspondant trouvé.</p>
      ) : (
        <div className="flex flex-col gap-4 py-1">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.04em] text-ink-3">{g.label}</div>
              <div className="flex flex-col gap-1.5">
                {g.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.onClick}
                    className="flex items-center gap-2.5 rounded-xl border border-line-field bg-surface-sub px-3 py-2 text-left text-[13.5px] font-semibold text-ink transition hover:bg-line-row"
                  >
                    {target.kind === 'volunteer' ? <Avatar name={item.name} avatarUrl={item.avatarUrl} /> : null}
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <span className="shrink-0 text-[12px] font-semibold text-ink-3">{item.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
