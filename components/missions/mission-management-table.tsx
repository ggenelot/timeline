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
      <div className="mt-6 rounded-[14px] border border-dashed border-[#cbd5e1] bg-white p-7 text-center text-sm text-[#94a3b8]">
        Aucun résultat avec les filtres sélectionnés.
      </div>
    );
  }

  return (
    <div className="mt-6 max-h-[70vh] overflow-y-auto overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="sticky top-0 bg-slate-50 text-left text-slate-700">
          <tr>
            <th className="px-4 py-2 font-medium">Titre</th>
            <th className="px-4 py-2 font-medium">Date</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Statut</th>
            <th className="px-4 py-2 font-medium">Dispo / Indispo</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {missions.map((mission) => {
            const missionType = missionTypeById.get(mission.mission_type_id);
            const typeColor = typeColorById.get(mission.mission_type_id) ?? '#64748b';
            const stats = proposalStatsByMission.get(mission.id);
            const canEdit = isAdmin || canManageMissionTypeIds.includes(mission.mission_type_id);

            return (
              <tr key={mission.id}>
                <td className="max-w-[280px] truncate px-4 py-2 font-medium text-slate-900">{mission.title}</td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-700">
                  {new Date(mission.starts_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-700">
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
                <td className="whitespace-nowrap px-4 py-2 text-slate-700">
                  <span className="font-medium text-emerald-700">{stats?.availableCount ?? 0}</span>
                  {' / '}
                  <span className="font-medium text-slate-500">{stats?.unavailableCount ?? 0}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  <div className="flex items-center gap-2">
                    {mission.status === 'draft' && isAdmin ? (
                      <button
                        type="button"
                        onClick={() => void onPublishDraft(mission.id)}
                        className="rounded-[9px] border border-emerald-300 bg-emerald-50 px-[10px] py-[5px] text-[12px] font-semibold text-emerald-700 hover:bg-emerald-100"
                      >
                        Publier
                      </button>
                    ) : null}
                    {canEdit ? (
                      <Link
                        href={`/missions/${mission.id}`}
                        className="rounded-[9px] border border-[#e2e8f0] bg-white px-[10px] py-[5px] text-[12px] font-semibold text-[#334155] hover:bg-slate-50"
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
