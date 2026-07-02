'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { VolunteerTimelineView } from '@/components/missions/volunteer-timeline-view';
import { useMissionsData } from '@/components/missions/use-missions-data';

function parseTypeFilter(value: string | null, validIds: string[]): 'all' | string {
  if (value && (value === 'all' || validIds.includes(value))) return value;
  return 'all';
}

export default function MissionsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    profile,
    missions,
    missionTypes,
    missionTypeById,
    typeColorById,
    relationByMission,
    proposalStatsByMission,
    error,
    loading,
    reload
  } = useMissionsData();

  const missionTypeIds = useMemo(() => missionTypes.map((t) => t.id), [missionTypes]);
  const selectedTypeId = useMemo(() => parseTypeFilter(searchParams.get('type'), missionTypeIds), [searchParams, missionTypeIds]);

  function handleChangeTypeFilter(nextTypeId: 'all' | string) {
    const params = new URLSearchParams(searchParams.toString());

    if (nextTypeId === 'all') {
      params.delete('type');
    } else {
      params.set('type', nextTypeId);
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  if (loading) {
    return <p className="text-sm text-ink-2">Chargement des missions...</p>;
  }

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-[880px]">
        <div className="rounded-lg border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error ?? 'Profil introuvable.'}</div>
      </div>
    );
  }

  return (
    <VolunteerTimelineView
      error={error}
      missions={missions}
      missionTypes={missionTypes}
      missionTypeById={missionTypeById}
      typeColorById={typeColorById}
      relationByMission={relationByMission}
      proposalStatsByMission={proposalStatsByMission}
      selectedTypeId={selectedTypeId}
      onChangeTypeFilter={handleChangeTypeFilter}
      onReload={reload}
    />
  );
}
