'use client';

import type { OpeMission } from '@/lib/types';
import type {
  BoardMaterielRequirement,
  BoardMaterielSlot,
  BoardRole,
  BoardRoleSlot,
  BoardSelection,
  ContainerDragPayload,
  VolunteerDragPayload,
} from '@/lib/mission-board';
import { resolveMissionTypeColor, formatMissionDuration } from '@/lib/mission-timeline';
import { Avatar, StatusBadge, formatTimeRange } from '@/components/ope/atoms';
import { DropZone, dragStartHandler } from '@/components/ope/board/drop-zone';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

function RoleSlotChip({
  slot,
  missionId,
  requiredSkillId,
  roleName,
  skillId,
  selected,
  onSelectFilled,
  onClickEmpty,
  onDrop,
  onRemove,
}: {
  slot: BoardRoleSlot;
  missionId: string;
  requiredSkillId: string;
  roleName: string;
  skillId: string | null;
  selected: BoardSelection | null;
  onSelectFilled: (assignmentId: string, volunteerId: string, label: string) => void;
  onClickEmpty: () => void;
  onDrop: (payload: VolunteerDragPayload) => void;
  onRemove: (assignmentId: string) => void;
}) {
  if (slot.filled) {
    const active = selected?.kind === 'volunteer' && selected.fromAssignmentId === slot.assignment_id;
    return (
      <div
        draggable
        onDragStart={dragStartHandler({
          kind: 'volunteer',
          volunteerId: slot.volunteer_id,
          label: slot.full_name ?? 'Bénévole',
          fromAssignmentId: slot.assignment_id,
          fromMissionId: missionId,
        })}
        onClick={() => onSelectFilled(slot.assignment_id, slot.volunteer_id, slot.full_name ?? 'Bénévole')}
        title={slot.full_name ?? 'Bénévole'}
        className={cn(
          'flex min-w-[110px] cursor-pointer items-center gap-[5px] rounded-full border border-line-field bg-surface-sub py-[3px] pl-[3px] pr-2 text-[11.5px] font-semibold text-ink transition',
          active && 'ring-2 ring-brand ring-offset-1'
        )}
      >
        <Avatar name={slot.full_name} avatarUrl={slot.avatar_url} />
        <span className="min-w-0 flex-1 truncate">{slot.full_name ?? 'Bénévole'}</span>
        {slot.mismatch ? <Icon name="warning" size={14} className="shrink-0 text-warn-bar" title="Compétence non validée" /> : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(slot.assignment_id);
          }}
          aria-label="Retirer"
          className="shrink-0 text-ink-4 hover:text-ink-2"
        >
          <Icon name="close" size={13} />
        </button>
      </div>
    );
  }

  const canPlace = selected?.kind === 'volunteer';
  return (
    <DropZone
      kind="volunteer"
      onDrop={onDrop}
      className={cn(
        'flex min-w-[90px] items-center justify-center rounded-full border-[1.5px] border-dashed px-3 py-[5px] text-[11px] font-semibold',
        canPlace ? 'border-accent bg-accent-soft/40 text-accent-text' : 'border-line-field bg-surface-card text-ink-4'
      )}
      activeClassName="!border-accent !bg-accent-soft"
    >
      <button
        type="button"
        onClick={onClickEmpty}
        title={canPlace ? undefined : `Créneau : ${roleName}`}
        className="w-full cursor-pointer text-center"
      >
        + déposer
      </button>
    </DropZone>
  );
}

function MaterielSlotChip({
  slot,
  requirementId,
  categoryName,
  selected,
  canEdit,
  onSelectFilled,
  onClickEmpty,
  onDrop,
  onRemove,
}: {
  slot: BoardMaterielSlot;
  requirementId: string;
  categoryName: string;
  selected: BoardSelection | null;
  canEdit: boolean;
  onSelectFilled: (assignmentId: string, containerId: string, label: string) => void;
  onClickEmpty: () => void;
  onDrop: (payload: ContainerDragPayload) => void;
  onRemove: (assignmentId: string) => void;
}) {
  if (slot.filled) {
    const active = selected?.kind === 'container' && selected.fromAssignmentId === slot.assignment_id;
    const label = slot.code ? `${slot.name} · ${slot.code}` : slot.name;
    return (
      <div
        draggable={canEdit}
        onDragStart={canEdit ? dragStartHandler({ kind: 'container', containerId: slot.materiel_type_id, fromAssignmentId: slot.assignment_id }) : undefined}
        onClick={canEdit ? () => onSelectFilled(slot.assignment_id, slot.materiel_type_id, label) : undefined}
        title={slot.name}
        className={cn(
          'flex min-w-[110px] items-center gap-1.5 rounded-full border border-accent-ring bg-accent-soft py-[3px] pl-2.5 pr-2 text-[11.5px] font-semibold text-accent-text transition',
          canEdit && 'cursor-pointer',
          active && 'ring-2 ring-brand ring-offset-1'
        )}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {canEdit ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(slot.assignment_id);
            }}
            aria-label="Retirer"
            className="shrink-0 text-accent-text/70 hover:text-accent-text"
          >
            <Icon name="close" size={13} />
          </button>
        ) : null}
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="flex min-w-[90px] items-center justify-center rounded-full border-[1.5px] border-dashed border-line-field bg-surface-card px-3 py-[5px] text-[11px] font-semibold text-ink-4">
        vide
      </div>
    );
  }

  const canPlace = selected?.kind === 'container';
  return (
    <DropZone
      kind="container"
      onDrop={onDrop}
      className={cn(
        'flex min-w-[90px] items-center justify-center rounded-full border-[1.5px] border-dashed px-3 py-[5px] text-[11px] font-semibold',
        canPlace ? 'border-accent bg-accent-soft/40 text-accent-text' : 'border-line-field bg-surface-card text-ink-4'
      )}
      activeClassName="!border-accent !bg-accent-soft"
    >
      <button type="button" onClick={onClickEmpty} title={`Créneau : ${categoryName}`} className="w-full cursor-pointer text-center">
        + déposer
      </button>
    </DropZone>
  );
}

function progressStyle(filled: number, qty: number): string {
  if (filled >= qty) return 'bg-ok-soft text-ok-text';
  if (filled === 0) return 'bg-surface-sub text-ink-3';
  return 'bg-warn-soft text-warn-text';
}

export function BoardMissionCard({
  mission,
  roles,
  materiels,
  isExpanded,
  onToggleExpand,
  selected,
  canEditMateriel,
  onSelectVolunteer,
  onSelectContainer,
  onDropVolunteerSlot,
  onDropContainerSlot,
  onClickEmptyVolunteerSlot,
  onClickEmptyContainerSlot,
  onRemoveVolunteer,
  onRemoveContainer,
}: {
  mission: OpeMission;
  roles: BoardRole[];
  materiels: BoardMaterielRequirement[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  selected: BoardSelection | null;
  canEditMateriel: boolean;
  onSelectVolunteer: (payload: { volunteerId: string; fromAssignmentId?: string; label: string }) => void;
  onSelectContainer: (payload: { containerId: string; fromAssignmentId?: string; label: string }) => void;
  onDropVolunteerSlot: (requiredSkillId: string, roleName: string, payload: VolunteerDragPayload) => void;
  onDropContainerSlot: (requirementId: string, payload: ContainerDragPayload) => void;
  onClickEmptyVolunteerSlot: (requiredSkillId: string, skillId: string | null, roleName: string) => void;
  onClickEmptyContainerSlot: (requirementId: string, categoryId: string | null, categoryName: string) => void;
  onRemoveVolunteer: (assignmentId: string) => void;
  onRemoveContainer: (assignmentId: string) => void;
}) {
  const accent = resolveMissionTypeColor(mission.type.name, mission.type.color);

  const missingVol = roles.reduce((sum, r) => sum + Math.max(0, r.qty - r.filled), 0);
  const missingMat = materiels.reduce((sum, r) => sum + Math.max(0, r.qty - r.filled), 0);
  const summaryParts: string[] = [];
  if (missingVol > 0) summaryParts.push(`${missingVol} bénévole${missingVol > 1 ? 's' : ''} manquant${missingVol > 1 ? 's' : ''}`);
  if (missingMat > 0) summaryParts.push(`${missingMat} matériel${missingMat > 1 ? 's' : ''} manquant${missingMat > 1 ? 's' : ''}`);
  const isComplete = summaryParts.length === 0;

  return (
    <div
      className="overflow-hidden rounded-[16px] border border-line bg-surface-card shadow-card"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <div onClick={onToggleExpand} className="cursor-pointer p-[13px_14px]">
        <div className="mb-[7px] flex items-center justify-between gap-2">
          <span className="text-[10.5px] font-extrabold uppercase tracking-[0.05em]" style={{ color: accent }}>
            {mission.type.name ?? 'Mission'}
          </span>
          <div className="flex items-center gap-1.5">
            <StatusBadge status={mission.status} />
            <Icon name={isExpanded ? 'expand_less' : 'expand_more'} size={16} className="text-ink-4" />
          </div>
        </div>
        <h3 className="mb-[7px] text-[15px] font-extrabold leading-[1.25] text-ink">
          {mission.type.name ?? 'Mission'} — {mission.location ?? 'Lieu à préciser'}
        </h3>
        <div className="flex flex-col gap-[3px] text-[12.5px] text-ink-2">
          <div>
            🕒 {formatTimeRange(mission.starts_at, mission.ends_at)}{' '}
            <span className="text-ink-3">({formatMissionDuration(mission.starts_at, mission.ends_at)})</span>
          </div>
          {mission.location ? <div>📍 {mission.location}</div> : null}
        </div>
        {!isExpanded ? (
          <div className={cn('mt-[9px] border-t border-line-row pt-[9px] text-[12.5px] font-bold', isComplete ? 'text-ok-text' : 'text-warn-text')}>
            {isComplete ? '✓ Équipe complète' : `⚠ ${summaryParts.join(' · ')}`}
          </div>
        ) : null}
      </div>

      {isExpanded ? (
        <div className="px-[14px] pb-[13px]" onClick={(e) => e.stopPropagation()}>
          {roles.map((role) => (
            <div key={role.requiredSkillId} className="mb-[9px]">
              <div className="mb-[5px] flex items-center justify-between">
                <span className="text-[11px] font-bold text-ink-2">{role.name}</span>
                <span className={cn('rounded-full px-[7px] py-px text-[11px] font-bold', progressStyle(role.filled, role.qty))}>
                  {role.filled}/{role.qty}
                </span>
              </div>
              <div className="flex flex-wrap gap-[5px]">
                {role.slots.map((slot, i) => (
                  <RoleSlotChip
                    key={slot.filled ? slot.assignment_id : `${role.requiredSkillId}-${i}`}
                    slot={slot}
                    missionId={mission.id}
                    requiredSkillId={role.requiredSkillId}
                    roleName={role.name}
                    skillId={role.skillId}
                    selected={selected}
                    onSelectFilled={(assignmentId, volunteerId, label) => onSelectVolunteer({ volunteerId, fromAssignmentId: assignmentId, label })}
                    onClickEmpty={() => onClickEmptyVolunteerSlot(role.requiredSkillId, role.skillId, role.name)}
                    onDrop={(payload) => onDropVolunteerSlot(role.requiredSkillId, role.name, payload)}
                    onRemove={onRemoveVolunteer}
                  />
                ))}
              </div>
            </div>
          ))}

          {materiels.length > 0 ? (
            <div className="mt-2 border-t border-line-row pt-[9px]">
              {materiels.map((req) => (
                <div key={req.requirementId} className="mb-2">
                  <div className="mb-[5px] flex items-center justify-between">
                    <span className="text-[11px] font-bold text-ink-2">{req.name}</span>
                    <span className={cn('rounded-full px-[7px] py-px text-[11px] font-bold', progressStyle(req.filled, req.qty))}>
                      {req.filled}/{req.qty}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-[5px]">
                    {req.slots.map((slot, i) => (
                      <MaterielSlotChip
                        key={slot.filled ? slot.assignment_id : `${req.requirementId}-${i}`}
                        slot={slot}
                        requirementId={req.requirementId}
                        categoryName={req.name}
                        selected={selected}
                        canEdit={canEditMateriel}
                        onSelectFilled={(assignmentId, containerId, label) => onSelectContainer({ containerId, fromAssignmentId: assignmentId, label })}
                        onClickEmpty={() => onClickEmptyContainerSlot(req.requirementId, req.categoryId, req.name)}
                        onDrop={(payload) => onDropContainerSlot(req.requirementId, payload)}
                        onRemove={onRemoveContainer}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
