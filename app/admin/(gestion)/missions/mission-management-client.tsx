'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { MissionStatus } from '@/lib/types';
import { NewMissionSplitButton } from '@/components/missions/new-mission-split-button';
import { MissionManagementTimeline } from '@/components/missions/mission-management-timeline';
import { MissionManagementTable } from '@/components/missions/mission-management-table';
import { useMissionsData } from '@/components/missions/use-missions-data';
import { PageHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

type ManagementView = 'timeline' | 'table';

const STATUS_FILTER_VALUES: Array<'all' | MissionStatus> = ['all', 'draft', 'proposed', 'closed', 'confirmed', 'cancelled'];

function parseTypeFilter(value: string | null, validIds: string[]): 'all' | string {
  if (value && (value === 'all' || validIds.includes(value))) return value;
  return 'all';
}

function parseStatusFilter(value: string | null): 'all' | MissionStatus {
  if (value && STATUS_FILTER_VALUES.includes(value as 'all' | MissionStatus)) {
    return value as 'all' | MissionStatus;
  }
  return 'all';
}

function parseView(value: string | null): ManagementView {
  return value === 'table' ? 'table' : 'timeline';
}

export function MissionManagementClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [accessChecked, setAccessChecked] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function checkAccess() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace('/login');
        return;
      }

      const { data: profileData } = await supabase.from('profiles').select('role').eq('id', authData.user.id).single();

      if (!profileData) {
        setAccessError('Accès réservé aux administrateurs et responsables.');
        setAccessChecked(true);
        return;
      }

      if (profileData.role !== 'admin') {
        const { data: canManage } = await supabase.rpc('has_role_behavior', {
          _user_id: authData.user.id,
          _resource_type: 'mission',
          _behavior: 'can_manage'
        });
        if (!canManage) {
          setAccessError('Accès réservé aux administrateurs et responsables.');
          setAccessChecked(true);
          return;
        }
      }

      setAccessChecked(true);
    }
    void checkAccess();
  }, [router]);

  const {
    profile,
    missions,
    missionTypes,
    missionTypeById,
    typeColorById,
    proposalStatsByMission,
    canManageMissionTypeIds,
    error,
    loading,
    publishDraftMission,
    bulkUpdateMissionStatus,
    bulkDeleteMissions
  } = useMissionsData();

  const isAdmin = profile?.role === 'admin';

  const missionTypeIds = useMemo(() => missionTypes.map((t) => t.id), [missionTypes]);
  const selectedTypeId = useMemo(() => parseTypeFilter(searchParams.get('type'), missionTypeIds), [searchParams, missionTypeIds]);
  const selectedStatus = useMemo(() => parseStatusFilter(searchParams.get('status')), [searchParams]);
  const view = useMemo(() => parseView(searchParams.get('view')), [searchParams]);

  // A responsable with can_manage limited to specific mission types must only see
  // those missions/types/counts here, even though RLS lets them read every mission.
  const manageableMissions = useMemo(
    () => (isAdmin ? missions : missions.filter((mission) => canManageMissionTypeIds.includes(mission.mission_type_id))),
    [isAdmin, missions, canManageMissionTypeIds]
  );

  const visibleMissionTypes = useMemo(
    () => (isAdmin ? missionTypes : missionTypes.filter((type) => canManageMissionTypeIds.includes(type.id))),
    [isAdmin, missionTypes, canManageMissionTypeIds]
  );

  const scopedMissionCountsByStatus = useMemo(
    () =>
      manageableMissions.reduce<Record<MissionStatus, number>>(
        (counts, mission) => {
          counts[mission.status] += 1;
          return counts;
        },
        { draft: 0, proposed: 0, confirmed: 0, closed: 0, cancelled: 0 }
      ),
    [manageableMissions]
  );

  const scopedMissionCountsByTypeId = useMemo(
    () =>
      manageableMissions.reduce<Record<string, number>>((counts, mission) => {
        counts[mission.mission_type_id] = (counts[mission.mission_type_id] ?? 0) + 1;
        return counts;
      }, {}),
    [manageableMissions]
  );

  function updateParams(next: { type?: 'all' | string; status?: 'all' | MissionStatus; view?: ManagementView }) {
    const params = new URLSearchParams(searchParams.toString());
    const nextTypeId = next.type ?? selectedTypeId;
    const nextStatus = next.status ?? selectedStatus;
    const nextView = next.view ?? view;

    if (nextTypeId === 'all') params.delete('type');
    else params.set('type', nextTypeId);

    if (nextStatus === 'all') params.delete('status');
    else params.set('status', nextStatus);

    if (nextView === 'timeline') params.delete('view');
    else params.set('view', nextView);

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  const filteredMissions = useMemo(
    () =>
      manageableMissions.filter((mission) => {
        const normalizedSearch = searchQuery.trim().toLocaleLowerCase('fr-FR');

        if (normalizedSearch.length > 0) {
          const searchableContent = [mission.title, mission.description, mission.location]
            .filter((value): value is string => Boolean(value))
            .join(' ')
            .toLocaleLowerCase('fr-FR');

          if (!searchableContent.includes(normalizedSearch)) return false;
        }

        if (selectedTypeId !== 'all' && mission.mission_type_id !== selectedTypeId) return false;
        if (selectedStatus !== 'all' && mission.status !== selectedStatus) return false;

        return true;
      }),
    [manageableMissions, searchQuery, selectedTypeId, selectedStatus]
  );

  if (!accessChecked || loading) {
    return <p className="text-sm text-ink-2">Chargement...</p>;
  }

  if (accessError) {
    return (
      <div className="mx-auto w-full max-w-[880px]">
        <div className="rounded-[10px] border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{accessError}</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-[880px]">
        <div className="rounded-[10px] border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error ?? 'Profil introuvable.'}</div>
      </div>
    );
  }

  const statusCards: Array<{ key: 'all' | MissionStatus; label: string; count: number; color: string }> = [
    { key: 'all', label: 'Toutes', count: manageableMissions.length, color: '#16203A' },
    { key: 'draft', label: 'Brouillons', count: scopedMissionCountsByStatus.draft, color: '#B45309' },
    { key: 'proposed', label: 'Proposées', count: scopedMissionCountsByStatus.proposed, color: '#1E3C87' },
    { key: 'confirmed', label: 'Confirmées', count: scopedMissionCountsByStatus.confirmed, color: '#12805A' },
    ...(scopedMissionCountsByStatus.closed > 0
      ? [{ key: 'closed' as MissionStatus, label: 'Clôturées', count: scopedMissionCountsByStatus.closed, color: '#5B6478' }]
      : []),
    ...(scopedMissionCountsByStatus.cancelled > 0
      ? [{ key: 'cancelled' as MissionStatus, label: 'Annulées', count: scopedMissionCountsByStatus.cancelled, color: '#D14343' }]
      : [])
  ];

  return (
    <div className="mx-auto w-full max-w-[880px]">
      {error ? <div className="mb-4 rounded-[10px] border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div> : null}

      <PageHeader
        title="Gestion des missions"
        subtitle={
          <>
            {filteredMissions.length} mission{filteredMissions.length > 1 ? 's' : ''} affichée{filteredMissions.length > 1 ? 's' : ''} sur {missions.length}
          </>
        }
        actions={
          isAdmin ? (
            <>
              <Button variant="ghost" icon="upload" onClick={() => router.push('/admin/missions/import')}>
                Importer des missions
              </Button>
              <NewMissionSplitButton />
            </>
          ) : null
        }
      />

      {/* Sous-mode */}
      <div className="inline-flex rounded-full border border-line bg-surface-card p-1">
        {(['timeline', 'table'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => updateParams({ view: mode })}
            className={cn(
              'rounded-full px-4 py-1.5 text-[13px] font-semibold transition',
              view === mode ? 'bg-brand text-white' : 'text-ink-2 hover:bg-surface-sub'
            )}
          >
            {mode === 'timeline' ? 'Timeline' : 'Tableau'}
          </button>
        ))}
      </div>

      {/* Cartes-filtres par statut */}
      <div className="mt-5 flex flex-wrap gap-3">
        {statusCards.map((card) => {
          const active = selectedStatus === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => updateParams({ status: card.key })}
              className={cn(
                'flex-1 basis-[150px] rounded-2xl bg-surface-card px-4 py-[14px] text-left transition',
                active ? 'border-[1.5px] border-accent shadow-card' : 'border border-line'
              )}
            >
              <div className="font-display text-[26px] leading-none" style={{ color: card.color }}>
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
          onClick={() => updateParams({ type: 'all' })}
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-[13px] py-1.5 text-[13px] transition',
            selectedTypeId === 'all'
              ? 'border border-accent-ring bg-accent-soft font-semibold text-accent-text'
              : 'border border-line bg-surface-card font-medium text-ink-2'
          )}
        >
          <span className="h-[7px] w-[7px] rounded-full bg-ink-3" />
          Tous les types
        </button>
        {visibleMissionTypes.map((missionType) => {
          const active = selectedTypeId === missionType.id;
          return (
            <button
              key={missionType.id}
              type="button"
              onClick={() => updateParams({ type: missionType.id })}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-[13px] py-1.5 text-[13px] transition',
                active
                  ? 'border border-accent-ring bg-accent-soft font-semibold text-accent-text'
                  : 'border border-line bg-surface-card font-medium text-ink-2'
              )}
            >
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: typeColorById.get(missionType.id) ?? '#5B6478' }} />
              {missionType.name} {scopedMissionCountsByTypeId[missionType.id] ?? 0}
            </button>
          );
        })}
      </div>

      {/* Recherche */}
      <div className="relative mt-3">
        <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Rechercher une mission"
          className="w-full rounded-full border border-line-field bg-surface-card py-2 pl-10 pr-4 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring"
        />
      </div>

      {view === 'timeline' ? (
        <MissionManagementTimeline
          missions={filteredMissions}
          missionTypeById={missionTypeById}
          typeColorById={typeColorById}
          proposalStatsByMission={proposalStatsByMission}
          isAdmin={isAdmin}
          canManageMissionTypeIds={canManageMissionTypeIds}
          onPublishDraft={publishDraftMission}
        />
      ) : (
        <MissionManagementTable
          missions={filteredMissions}
          missionTypeById={missionTypeById}
          typeColorById={typeColorById}
          proposalStatsByMission={proposalStatsByMission}
          isAdmin={isAdmin}
          canManageMissionTypeIds={canManageMissionTypeIds}
          onPublishDraft={publishDraftMission}
          onBulkStatusChange={bulkUpdateMissionStatus}
          onBulkDelete={bulkDeleteMissions}
        />
      )}
    </div>
  );
}
