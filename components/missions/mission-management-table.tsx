'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMissionRequirementLabel, MISSION_STATUS_COLOR, MISSION_STATUS_LABELS, MISSION_STATUS_ORDER } from '@/lib/missions';
import { MissionStatus } from '@/lib/types';
import { MissionType, MissionWithRequiredSkills, ProposalStats, RetainedVolunteer } from '@/components/missions/use-missions-data';

type BulkStatusResult = { updatedCount: number; failedCount: number };

const AVATAR_MAX = 5;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function MissionManagementTable({
  missions,
  missionTypeById,
  typeColorById,
  proposalStatsByMission,
  retainedVolunteersByMission,
  isAdmin,
  canManageMissionTypeIds: _canManageMissionTypeIds,
  onPublishDraft,
  onBulkStatusChange,
  onBulkDelete
}: {
  missions: MissionWithRequiredSkills[];
  missionTypeById: Map<string, MissionType>;
  typeColorById: Map<string, string>;
  proposalStatsByMission: Map<string, ProposalStats>;
  retainedVolunteersByMission: Map<string, RetainedVolunteer[]>;
  isAdmin: boolean;
  canManageMissionTypeIds: string[];
  onPublishDraft: (missionId: string) => Promise<void>;
  onBulkStatusChange?: (missionIds: string[], status: MissionStatus) => Promise<BulkStatusResult>;
  onBulkDelete?: (missionIds: string[]) => Promise<{ deletedCount: number }>;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);

  const missionById = useMemo(() => new Map(missions.map((mission) => [mission.id, mission])), [missions]);
  const canBulkManage = isAdmin && Boolean(onBulkStatusChange);

  useEffect(() => {
    if (!statusMenuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (statusMenuRef.current && !statusMenuRef.current.contains(event.target as Node)) {
        setStatusMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [statusMenuOpen]);

  if (missions.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-line-field bg-surface-card p-7 text-center text-sm text-ink-3">
        Aucun résultat avec les filtres sélectionnés.
      </div>
    );
  }

  const selectedCount = selectedIds.size;
  const allSelected = missions.every((mission) => selectedIds.has(mission.id));

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(missions.map((mission) => mission.id)));
  }

  function toggleRow(missionId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(missionId)) next.delete(missionId);
      else next.add(missionId);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function applyBulkStatus(status: MissionStatus) {
    if (!onBulkStatusChange || selectedCount === 0) return;

    const ids = Array.from(selectedIds);
    setStatusMenuOpen(false);
    setPendingBulkAction(true);
    setConfirmationMessage(null);

    // Le passage brouillon → proposé réutilise l'action existante
    // (publishDraftMission) plutôt que de dupliquer sa logique.
    const draftIds = status === 'proposed' ? ids.filter((id) => missionById.get(id)?.status === 'draft') : [];
    const remainingIds = ids.filter((id) => !draftIds.includes(id));

    await Promise.all(draftIds.map((id) => onPublishDraft(id)));
    const result = remainingIds.length > 0 ? await onBulkStatusChange(remainingIds, status) : { updatedCount: 0, failedCount: 0 };

    const updatedCount = draftIds.length + result.updatedCount;
    const failedCount = ids.length - updatedCount;

    setPendingBulkAction(false);
    // Si rien n'a réellement été mis à jour, l'erreur détaillée remontée par
    // onBulkStatusChange s'affiche déjà via la bannière d'erreur de la page ;
    // pas la peine d'ajouter un message de succès trompeur ici.
    if (updatedCount > 0) {
      setConfirmationMessage(
        `Statut « ${MISSION_STATUS_LABELS[status]} » appliqué à ${updatedCount} mission(s).${
          failedCount > 0 ? ` ${failedCount} non éligible(s), ignorée(s).` : ''
        }`
      );
    }
    clearSelection();
  }

  async function handleBulkDelete() {
    if (!onBulkDelete || selectedCount === 0) return;

    const confirmed = window.confirm(`Supprimer définitivement ${selectedCount} mission(s) ? Cette action est irréversible.`);
    if (!confirmed) return;

    setPendingBulkAction(true);
    setConfirmationMessage(null);
    const { deletedCount } = await onBulkDelete(Array.from(selectedIds));
    setPendingBulkAction(false);
    // Idem : un échec silencieux (RLS) remonte déjà via la bannière d'erreur
    // de la page, inutile d'afficher "0 mission(s) supprimée(s)." en plus.
    if (deletedCount > 0) {
      setConfirmationMessage(`${deletedCount} mission(s) supprimée(s).`);
    }
    clearSelection();
  }

  function handleExportSelection() {
    const ids = selectedCount > 0 ? selectedIds : new Set(missions.map((mission) => mission.id));
    const rows = missions.filter((mission) => ids.has(mission.id));
    const header = ['Titre', 'Date', 'Type', 'Statut', 'Disponibles', 'Indisponibles'];
    const lines = [header, ...rows.map((mission) => {
      const stats = proposalStatsByMission.get(mission.id);
      return [
        mission.title,
        new Date(mission.starts_at).toLocaleDateString('fr-FR'),
        missionTypeById.get(mission.mission_type_id)?.name ?? '',
        MISSION_STATUS_LABELS[mission.status],
        String(stats?.availableCount ?? 0),
        String(stats?.unavailableCount ?? 0)
      ];
    })];

    const csv = lines.map((line) => line.map((value) => `"${value.replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'missions.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="relative mt-6 overflow-hidden rounded-[18px] border border-line bg-surface-card shadow-card">
      {confirmationMessage ? (
        <div className="mx-3.5 mt-2.5 flex items-center justify-between gap-3 rounded-xl border border-ok-line bg-ok-soft px-3.5 py-2.5 text-[12.5px] font-semibold text-ok-text">
          <span>{confirmationMessage}</span>
          <button type="button" onClick={() => setConfirmationMessage(null)} className="text-ok-text/70 hover:text-ok-text" aria-label="Fermer">
            ×
          </button>
        </div>
      ) : null}

      {canBulkManage && selectedCount > 0 ? (
        <div className="relative mx-3.5 mt-2.5 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-sub px-3.5 py-[9px]">
          <span className="text-[12.5px] font-bold text-ink">
            {selectedCount} sélectionnée{selectedCount > 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <div ref={statusMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setStatusMenuOpen((open) => !open)}
                disabled={pendingBulkAction}
                className="inline-flex items-center gap-1.5 rounded-full border border-line-field bg-white px-3 py-[5px] text-[11.5px] font-bold text-ink disabled:opacity-60"
              >
                Changer statut <span className="text-ink-3">▼</span>
              </button>
              {statusMenuOpen ? (
                <div className="absolute right-0 top-[calc(100%+6px)] z-10 min-w-[170px] rounded-xl border border-line bg-white p-1.5 shadow-lift">
                  {MISSION_STATUS_ORDER.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => void applyBulkStatus(status)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-[7px] text-left text-[12px] font-semibold text-ink hover:bg-surface-sub"
                    >
                      <span className="h-[7px] w-[7px] rounded-full" style={{ background: MISSION_STATUS_COLOR[status] }} />
                      {MISSION_STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleExportSelection}
              className="rounded-full border border-line-field bg-white px-3 py-[5px] text-[11.5px] font-bold text-ink"
            >
              Exporter
            </button>
            {onBulkDelete ? (
              <button
                type="button"
                onClick={() => void handleBulkDelete()}
                disabled={pendingBulkAction}
                className="rounded-full border border-[#F3C6C6] bg-bad-soft px-3 py-[5px] text-[11.5px] font-bold text-bad disabled:opacity-60"
              >
                Supprimer
              </button>
            ) : null}
            <button type="button" onClick={clearSelection} className="text-[16px] leading-none text-ink-3 hover:text-ink-2" aria-label="Effacer la sélection">
              ×
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left">
            <tr>
              <th className="w-10 px-4 py-3">
                {canBulkManage ? (
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="h-[15px] w-[15px] rounded border-line-field accent-brand"
                    aria-label="Tout sélectionner"
                  />
                ) : null}
              </th>
              <th className="px-4 py-3 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-3">Mission</th>
              <th className="px-4 py-3 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-3">Effectif</th>
              <th className="max-w-[170px] px-4 py-3 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-3">Compétences</th>
              <th className="max-w-[170px] px-4 py-3 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-3">Matériel</th>
              <th className="px-4 py-3 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-3">Bénévoles</th>
            </tr>
          </thead>
          <tbody>
            {missions.map((mission) => {
              const missionType = missionTypeById.get(mission.mission_type_id);
              const typeColor = typeColorById.get(mission.mission_type_id) ?? '#5B6478';
              const stats = proposalStatsByMission.get(mission.id);
              const available = stats?.availableCount ?? 0;
              const unavailable = stats?.unavailableCount ?? 0;
              const total = available + unavailable;
              const availablePct = total > 0 ? (available / total) * 100 : 0;
              const selected = selectedIds.has(mission.id);
              const statusColor = MISSION_STATUS_COLOR[mission.status];

              const isConfirmedLike = mission.status === 'confirmed' || mission.status === 'closed';
              const volunteers = isConfirmedLike
                ? retainedVolunteersByMission.get(mission.id) ?? []
                : stats?.availableVolunteers ?? [];
              const volunteerAvatars = volunteers.slice(0, AVATAR_MAX);
              const volunteerOverflow = Math.max(0, volunteers.length - AVATAR_MAX);
              const volunteerLabel = isConfirmedLike ? 'retenus' : 'inscrits';

              return (
                <tr
                  key={mission.id}
                  onClick={() => router.push(`/missions/${mission.id}`)}
                  className="cursor-pointer border-t border-line-row hover:bg-surface-sub"
                >
                  <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: statusColor }} aria-hidden />
                      {canBulkManage ? (
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleRow(mission.id)}
                          className="h-[15px] w-[15px] rounded border-line-field accent-brand"
                          aria-label={`Sélectionner ${mission.title}`}
                        />
                      ) : null}
                    </div>
                  </td>
                  <td className="max-w-[250px] px-4 py-3">
                    <div className="truncate font-semibold text-ink">{mission.title}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-ink-3">
                      <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: typeColor }} />
                      <span className="truncate">
                        {missionType?.name ?? '—'} ·{' '}
                        {new Date(mission.starts_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-1 w-[70px] shrink-0 overflow-hidden rounded-full bg-[#E4E8F0]">
                        <span className="h-full rounded-full bg-ok-bar" style={{ width: `${availablePct}%` }} />
                      </span>
                      <span className="text-[12px]">
                        <span className="font-bold text-ok-text">{available}</span>
                        <span className="text-ink-3">/{unavailable}</span>
                      </span>
                    </div>
                  </td>
                  <td className="max-w-[170px] px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(mission.mission_required_skills ?? []).map((requiredSkill) => (
                        <span
                          key={requiredSkill.id}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[#E3DCF7] bg-[#F4F1FB] px-2 py-[3px] text-[10.5px] font-semibold text-[#5B3FA0]"
                        >
                          <span className="h-[5px] w-[5px] rounded-full bg-[#8B6FD9]" />
                          {formatMissionRequirementLabel(requiredSkill.skill?.name, requiredSkill.quantity)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="max-w-[170px] px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(mission.mission_required_materiels ?? []).map((requiredMateriel) => (
                        <span
                          key={requiredMateriel.id}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[#DCE7F4] bg-[#F2F6FB] px-2 py-[3px] text-[10.5px] font-semibold text-[#2A5C8A]"
                        >
                          <span className="h-[5px] w-[5px] rounded-full bg-[#5B9BD1]" />
                          {Math.max(1, Math.trunc(requiredMateriel.quantity) || 1)} {requiredMateriel.category?.name ?? 'Matériel'}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center">
                      <div className="flex items-center">
                        {volunteerAvatars.map((volunteer, index) => (
                          <span
                            key={index}
                            title={volunteer.name}
                            style={{
                              marginLeft: index === 0 ? 0 : -8,
                              zIndex: AVATAR_MAX - index,
                              border: isConfirmedLike ? '2px solid #FFFFFF' : '2px dashed #B9C4D6'
                            }}
                            className="relative box-border inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#EDF1F8] text-[10px] font-bold text-[#3B4A63]"
                          >
                            {initialsOf(volunteer.name)}
                          </span>
                        ))}
                        {volunteerOverflow > 0 ? (
                          <span
                            style={{ marginLeft: -8, border: '2px solid #FFFFFF' }}
                            className="relative box-border inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#DDE3ED] text-[9.5px] font-bold text-[#4A5670]"
                          >
                            +{volunteerOverflow}
                          </span>
                        ) : null}
                      </div>
                      <span className="ml-2 text-[10px] text-ink-3">{volunteerLabel}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
