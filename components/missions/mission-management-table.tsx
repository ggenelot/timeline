'use client';

import Link from 'next/link';
import { getMissionStatusBadgeClass, MISSION_STATUS_LABELS } from '@/lib/missions';
import { MissionType, MissionWithRequiredSkills, ProposalStats } from '@/components/missions/use-missions-data';

export function MissionManagementTable({
  missions,
  missionTypeById,
  typeColorById,
  proposalStatsByMission,
  isAdmin,
  canManageMissionTypeIds,
  onPublishDraft
}: {
  missions: MissionWithRequiredSkills[];
  missionTypeById: Map<string, MissionType>;
  typeColorById: Map<string, string>;
  proposalStatsByMission: Map<string, ProposalStats>;
  isAdmin: boolean;
  canManageMissionTypeIds: string[];
  onPublishDraft: (missionId: string) => Promise<void>;
}) {
  if (missions.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-line-field bg-surface-card p-7 text-center text-sm text-ink-3">
        Aucun résultat avec les filtres sélectionnés.
      </div>
    );
  }

  return (
    <div className="mt-6 max-h-[70vh] overflow-y-auto overflow-x-auto rounded-2xl border border-line bg-surface-card">
      <table className="min-w-full divide-y divide-line-row text-sm">
        <thead className="sticky top-0 bg-surface-sub text-left text-ink-2">
          <tr>
            <th className="px-4 py-2 font-medium">Titre</th>
            <th className="px-4 py-2 font-medium">Date</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Statut</th>
            <th className="px-4 py-2 font-medium">Dispo / Indispo</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-row">
          {missions.map((mission) => {
            const missionType = missionTypeById.get(mission.mission_type_id);
            const typeColor = typeColorById.get(mission.mission_type_id) ?? '#5B6478';
            const stats = proposalStatsByMission.get(mission.id);
            const canEdit = isAdmin || canManageMissionTypeIds.includes(mission.mission_type_id);

            return (
              <tr key={mission.id}>
                <td className="max-w-[280px] truncate px-4 py-2 font-medium text-ink">{mission.title}</td>
                <td className="whitespace-nowrap px-4 py-2 text-ink-2">
                  {new Date(mission.starts_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-ink-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: typeColor }} />
                    {missionType?.name ?? '—'}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${getMissionStatusBadgeClass(mission.status)}`}>
                    {MISSION_STATUS_LABELS[mission.status]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-ink-2">
                  <span className="font-medium text-ok-text">{stats?.availableCount ?? 0}</span>
                  {' / '}
                  <span className="font-medium text-ink-3">{stats?.unavailableCount ?? 0}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  <div className="flex items-center gap-2">
                    {mission.status === 'draft' && isAdmin ? (
                      <button
                        type="button"
                        onClick={() => void onPublishDraft(mission.id)}
                        className="rounded-[9px] border border-ok-line bg-ok-soft px-[10px] py-[5px] text-[12px] font-semibold text-ok-text hover:bg-ok-line/40"
                      >
                        Publier
                      </button>
                    ) : null}
                    {canEdit ? (
                      <Link
                        href={`/missions/${mission.id}`}
                        className="rounded-[9px] border border-line-field bg-surface-card px-[10px] py-[5px] text-[12px] font-semibold text-ink-2 hover:bg-surface-sub"
                      >
                        Gérer
                      </Link>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
