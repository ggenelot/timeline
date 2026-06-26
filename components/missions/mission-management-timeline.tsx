'use client';

import { useState } from 'react';
import { MissionTimelineCard } from '@/components/missions/mission-timeline-card';
import { MissionStatus } from '@/lib/types';
import { groupMissionsByMonth, MISSION_STATUS_NODE_COLOR } from '@/lib/mission-timeline';
import { MissionType, MissionWithRequiredSkills, ProposalStats } from '@/components/missions/use-missions-data';

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function AdminTimelineNode({ status }: { status: MissionStatus }) {
  const color = MISSION_STATUS_NODE_COLOR[status];
  const hollow = status === 'draft' || status === 'cancelled';
  return (
    <span
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        left: 24,
        top: 28,
        width: 14,
        height: 14,
        background: hollow ? '#f1f5f9' : color,
        border: hollow ? `2px solid ${color}` : undefined,
        boxShadow: '0 0 0 4px #f1f5f9'
      }}
    />
  );
}

export function MissionManagementTimeline({
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const monthGroups = groupMissionsByMonth(missions);

  return (
    <div className="relative mt-6">
      <div className="pointer-events-none absolute bottom-0 left-[23px] top-0 w-[2px] bg-[#e3e7ee]" />

      {missions.length === 0 ? (
        <div className="ml-14 rounded-[14px] border border-dashed border-[#cbd5e1] bg-white p-7 text-center text-sm text-[#94a3b8]">
          Aucun résultat avec les filtres sélectionnés.
        </div>
      ) : (
        monthGroups.map((group) => (
          <div key={group.key}>
            <div className="relative py-2 pl-14 text-[12px] font-bold uppercase tracking-[0.14em] text-[#94a3b8]">
              {capitalize(group.label)}
            </div>
            <div className="space-y-4">
              {group.missions.map((mission) => {
                const typeColor = typeColorById.get(mission.mission_type_id) ?? '#64748b';
                return (
                  <div key={mission.id} className="relative pl-14">
                    <AdminTimelineNode status={mission.status} />
                    <MissionTimelineCard
                      mission={mission}
                      missionTypeName={missionTypeById.get(mission.mission_type_id)?.name}
                      typeColor={typeColor}
                      requiredSkills={mission.mission_required_skills ?? []}
                      variant="admin"
                      canEdit={isAdmin || canManageMissionTypeIds.includes(mission.mission_type_id)}
                      availableVolunteers={proposalStatsByMission.get(mission.id)?.availableVolunteers ?? []}
                      expanded={Boolean(expanded[mission.id])}
                      onToggle={() => setExpanded((prev) => ({ ...prev, [mission.id]: !prev[mission.id] }))}
                      onPublishDraft={isAdmin ? onPublishDraft : undefined}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
