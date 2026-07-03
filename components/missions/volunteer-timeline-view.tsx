'use client';

import { useMemo, useState } from 'react';
import { MissionTimelineCard } from '@/components/missions/mission-timeline-card';
import { groupMissionsByMonth, MissionRelation } from '@/lib/mission-timeline';
import { MissionType, MissionWithRequiredSkills, ProposalStats } from '@/components/missions/use-missions-data';
import { cn } from '@/lib/cn';

type BenevoleStatusFilter = 'all' | 'pending' | 'engaged' | 'retenu';

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function TimelineNode({ relation, typeColor }: { relation: MissionRelation; typeColor: string }) {
  const shadow = '0 0 0 4px #F2F5FA';
  const base = 'absolute -translate-x-1/2 -translate-y-1/2';
  const position = { left: 24, top: 28 } as const;

  if (relation === 'retenu') {
    return (
      <span
        className={`${base} flex items-center justify-center rounded-full text-[11px] font-bold text-white`}
        style={{ ...position, width: 20, height: 20, background: '#059669', boxShadow: shadow }}
      >
        ✓
      </span>
    );
  }

  if (relation === 'engaged') {
    return (
      <span
        className={`${base} rounded-full bg-surface-card`}
        style={{ ...position, width: 16, height: 16, border: '3px solid #059669', boxShadow: shadow }}
      />
    );
  }

  if (relation === 'declined') {
    return (
      <span
        className={`${base} rounded-full`}
        style={{ ...position, width: 14, height: 14, background: '#F2F5FA', border: '2px solid #A6AEBE', boxShadow: shadow }}
      />
    );
  }

  return (
    <span
      className={`${base} rounded-full`}
      style={{ ...position, width: 14, height: 14, background: typeColor, boxShadow: shadow }}
    />
  );
}

export function VolunteerTimelineView({
  error,
  missions,
  missionTypes,
  missionTypeById,
  typeColorById,
  relationByMission,
  proposalStatsByMission,
  selectedTypeId,
  onChangeTypeFilter,
  onReload
}: {
  error?: string | null;
  missions: MissionWithRequiredSkills[];
  missionTypes: MissionType[];
  missionTypeById: Map<string, MissionType>;
  typeColorById: Map<string, string>;
  relationByMission: Map<string, MissionRelation>;
  proposalStatsByMission: Map<string, ProposalStats>;
  selectedTypeId: 'all' | string;
  onChangeTypeFilter: (nextTypeId: 'all' | string) => void;
  onReload: () => void;
}) {
  const [benevoleStatusFilter, setBenevoleStatusFilter] = useState<BenevoleStatusFilter>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const today = new Date();
  const todayLabel = today.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' });

  const proposedMissions = useMemo(() => missions.filter((mission) => mission.status === 'proposed'), [missions]);

  const benevoleCounts = useMemo(() => {
    const scoped = proposedMissions.filter((mission) => selectedTypeId === 'all' || mission.mission_type_id === selectedTypeId);
    let pending = 0;
    let engaged = 0;
    let retenu = 0;
    scoped.forEach((mission) => {
      const relation = relationByMission.get(mission.id) ?? 'pending';
      if (relation === 'pending') pending += 1;
      if (relation === 'engaged' || relation === 'retenu') engaged += 1;
      if (relation === 'retenu') retenu += 1;
    });
    return { total: scoped.length, pending, engaged, retenu };
  }, [proposedMissions, selectedTypeId, relationByMission]);

  const subtitleStats = useMemo(() => {
    const pending = proposedMissions.filter((mission) => (relationByMission.get(mission.id) ?? 'pending') === 'pending').length;
    return { total: proposedMissions.length, pending };
  }, [proposedMissions, relationByMission]);

  const benevoleVisibleMissions = useMemo(
    () =>
      proposedMissions.filter((mission) => {
        if (selectedTypeId !== 'all' && mission.mission_type_id !== selectedTypeId) return false;
        const relation = relationByMission.get(mission.id) ?? 'pending';
        if (benevoleStatusFilter === 'pending') return relation === 'pending';
        if (benevoleStatusFilter === 'engaged') return relation === 'engaged' || relation === 'retenu';
        if (benevoleStatusFilter === 'retenu') return relation === 'retenu';
        return true;
      }),
    [proposedMissions, selectedTypeId, relationByMission, benevoleStatusFilter]
  );

  const monthGroups = useMemo(() => groupMissionsByMonth(benevoleVisibleMissions), [benevoleVisibleMissions]);

  const filterCards: Array<{ key: BenevoleStatusFilter; label: string; count: number; color: string }> = [
    { key: 'all', label: 'Toutes', count: benevoleCounts.total, color: '#16203A' },
    { key: 'pending', label: 'Je me positionne', count: benevoleCounts.pending, color: '#B45309' },
    { key: 'engaged', label: 'Je suis engagé.e', count: benevoleCounts.engaged, color: '#12805A' },
    { key: 'retenu', label: 'Je suis retenu.e', count: benevoleCounts.retenu, color: '#059669' }
  ];

  return (
    <div className="mx-auto w-full max-w-[880px]">
      {error ? <div className="mb-4 rounded-lg border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div> : null}

      <div>
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink">Missions</h1>
        <p className="mt-1 text-sm text-ink-2">
          {subtitleStats.total} mission{subtitleStats.total > 1 ? 's' : ''} proposée{subtitleStats.total > 1 ? 's' : ''} ·{' '}
          {subtitleStats.pending} en attente de votre réponse
        </p>
      </div>

      {/* Cartes-filtres */}
      <div className="mt-5 flex flex-wrap gap-3">
        {filterCards.map((card) => {
          const active = benevoleStatusFilter === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setBenevoleStatusFilter(card.key)}
              className={cn(
                'flex-1 basis-[160px] rounded-2xl bg-surface-card px-4 py-[14px] text-left transition hover:-translate-y-px hover:shadow-lift',
                active ? 'border-[1.5px] border-brand shadow-card' : 'border border-line'
              )}
            >
              <div className="font-display text-[30px] leading-none" style={{ color: card.color }}>
                {card.count}
              </div>
              <div className={cn('mt-1.5 text-[12.5px] font-semibold', active ? 'text-ink' : 'text-ink-2')}>{card.label}</div>
            </button>
          );
        })}
      </div>

      {/* Chips par type */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChangeTypeFilter('all')}
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-[13px] py-1.5 text-[13px] transition',
            selectedTypeId === 'all'
              ? 'border border-brand bg-brand font-semibold text-white'
              : 'border border-line bg-surface-card font-medium text-ink-2 hover:bg-surface-sub'
          )}
        >
          <span className="h-[7px] w-[7px] rounded-full bg-ink-3" />
          Tous les types
        </button>
        {missionTypes.map((missionType) => {
          const active = selectedTypeId === missionType.id;
          return (
            <button
              key={missionType.id}
              type="button"
              onClick={() => onChangeTypeFilter(missionType.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-[13px] py-1.5 text-[13px] transition',
                active
                  ? 'border border-brand bg-brand font-semibold text-white'
                  : 'border border-line bg-surface-card font-medium text-ink-2 hover:bg-surface-sub'
              )}
            >
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: typeColorById.get(missionType.id) ?? '#5B6478' }} />
              {missionType.name}
            </button>
          );
        })}
      </div>

      {monthGroups.length > 0 ? (
        <p className="mt-4 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-3">
          <span aria-hidden="true">👆</span>
          Glissez une carte à droite pour vous engager, à gauche pour vous rendre indisponible
        </p>
      ) : null}

      {/* Frise */}
      <div className="relative mt-6">
        <div className="pointer-events-none absolute bottom-0 left-[23px] top-0 w-[2px] bg-line" />

        {/* Repère Aujourd'hui */}
        <div className="relative pb-6 pl-14">
          <span
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface"
            style={{ left: 24, top: 11, width: 12, height: 12, border: '2px solid #8A93A6' }}
          />
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">Aujourd&apos;hui</span>
            <span className="text-[13px] text-ink-3">{todayLabel}</span>
          </div>
        </div>

        {monthGroups.length === 0 ? (
          <div className="ml-14 rounded-2xl border border-dashed border-line-field bg-surface-card p-7 text-center text-sm text-ink-3">
            Aucune mission dans cette catégorie.
          </div>
        ) : (
          monthGroups.map((group) => (
            <div key={group.key}>
              <div className="relative py-2 pl-14 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3">
                {capitalize(group.label)}
              </div>
              <div className="space-y-4">
                {group.missions.map((mission) => {
                  const relation = relationByMission.get(mission.id) ?? 'pending';
                  const typeColor = typeColorById.get(mission.mission_type_id) ?? '#5B6478';
                  return (
                    <div key={mission.id} className="relative pl-14">
                      <TimelineNode relation={relation} typeColor={typeColor} />
                      <MissionTimelineCard
                        mission={mission}
                        missionTypeName={missionTypeById.get(mission.mission_type_id)?.name}
                        typeColor={typeColor}
                        requiredSkills={mission.mission_required_skills ?? []}
                        variant="benevole"
                        relation={relation}
                        canPropose
                        availableVolunteers={proposalStatsByMission.get(mission.id)?.availableVolunteers ?? []}
                        expanded={Boolean(expanded[mission.id])}
                        onToggle={() => setExpanded((prev) => ({ ...prev, [mission.id]: !prev[mission.id] }))}
                        onResponse={onReload}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
