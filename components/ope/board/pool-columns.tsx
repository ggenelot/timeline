'use client';

import type { OpeContainer } from '@/lib/types';
import type { BoardDragPayload, BoardSelection, BoardVolunteerCandidate } from '@/lib/mission-board';
import { Avatar, MaterielChip } from '@/components/ope/atoms';
import { DropZone, dragStartHandler } from '@/components/ope/board/drop-zone';
import { cn } from '@/lib/cn';

const POOL_AREA_CLASS =
  'flex min-h-[52px] flex-1 flex-col gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-[#DDE3EC] bg-surface-sub p-2.5';
const POOL_AREA_ACTIVE_CLASS = 'border-accent bg-accent-soft/40';

// Colonne « Bénévoles disponibles » d'un jour : dépose ici pour désengager
// (dépôt en provenance d'un créneau de mission) ; touche/glisse un bénévole
// pour le sélectionner en vue d'une affectation.
export function VolunteerPoolColumn({
  candidates,
  selected,
  onSelect,
  onDropReturn,
}: {
  candidates: BoardVolunteerCandidate[];
  selected: BoardSelection | null;
  onSelect: (candidate: BoardVolunteerCandidate) => void;
  onDropReturn: (payload: BoardDragPayload) => void;
}) {
  return (
    <DropZone kind="volunteer" onDrop={onDropReturn} className={POOL_AREA_CLASS} activeClassName={POOL_AREA_ACTIVE_CLASS}>
      {candidates.length === 0 ? (
        <div className="py-2 text-center text-[11.5px] font-semibold text-ink-4">—</div>
      ) : (
        candidates.map((c) => {
          const active = selected?.kind === 'volunteer' && selected.volunteerId === c.volunteer_id && !selected.fromAssignmentId;
          return (
            <div
              key={c.volunteer_id}
              draggable
              onDragStart={dragStartHandler({ kind: 'volunteer', volunteerId: c.volunteer_id })}
              onClick={() => onSelect(c)}
              title={c.full_name ?? 'Bénévole'}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-full border border-line-field bg-surface-card py-[3px] pl-[3px] pr-2.5 text-[12px] font-semibold text-ink transition',
                active && 'ring-2 ring-brand ring-offset-1'
              )}
            >
              <Avatar name={c.full_name} avatarUrl={c.avatar_url} />
              <span className="max-w-[9rem] truncate">{c.full_name ?? 'Bénévole'}</span>
            </div>
          );
        })
      )}
    </DropZone>
  );
}

// Colonne « Matériel disponible » d'un jour : dispo (sélectionnable si
// `canEdit`) + indispo (toujours inerte). Écriture matériel réservée aux
// admins (RLS mission_materiel_assignments_write_admin) : en lecture seule
// pour les autres profils autorisés à gérer les missions.
export function MaterielPoolColumn({
  available,
  unavailable,
  selected,
  canEdit,
  onSelect,
  onDropReturn,
}: {
  available: OpeContainer[];
  unavailable: OpeContainer[];
  selected: BoardSelection | null;
  canEdit: boolean;
  onSelect: (container: OpeContainer) => void;
  onDropReturn: (payload: BoardDragPayload) => void;
}) {
  const body =
    available.length === 0 && unavailable.length === 0 ? (
      <div className="py-2 text-center text-[11.5px] font-semibold text-ink-4">—</div>
    ) : (
      <div className="flex flex-wrap gap-1.5">
        {available.map((c) => {
          const active = selected?.kind === 'container' && selected.containerId === c.id && !selected.fromAssignmentId;
          return (
            <div
              key={c.id}
              draggable={canEdit}
              onDragStart={canEdit ? dragStartHandler({ kind: 'container', containerId: c.id }) : undefined}
              onClick={canEdit ? () => onSelect(c) : undefined}
              className={cn('rounded-full transition', canEdit && 'cursor-pointer', active && 'ring-2 ring-brand ring-offset-1')}
            >
              <MaterielChip name={c.name} code={c.code} tone="available" />
            </div>
          );
        })}
        {unavailable.map((c) => (
          <MaterielChip key={c.id} name={c.name} code={c.code} tone="unavailable" title={c.unavailable_reason || 'Indisponible'} />
        ))}
      </div>
    );

  if (!canEdit) return <div className={POOL_AREA_CLASS}>{body}</div>;

  return (
    <DropZone kind="container" onDrop={onDropReturn} className={POOL_AREA_CLASS} activeClassName={POOL_AREA_ACTIVE_CLASS}>
      {body}
    </DropZone>
  );
}
