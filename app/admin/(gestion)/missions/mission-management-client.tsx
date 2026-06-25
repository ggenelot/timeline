'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { MissionStatus } from '@/lib/types';
import { NewMissionSplitButton } from '@/components/missions/new-mission-split-button';
import { MissionManagementTimeline } from '@/components/missions/mission-management-timeline';
import { MissionManagementTable } from '@/components/missions/mission-management-table';
import { useMissionsData } from '@/components/missions/use-missions-data';

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
    publishDraftMission
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
    return <p className="text-sm text-slate-600">Chargement...</p>;
  }

  if (accessError) {
    return (
      <div className="mx-auto w-full max-w-[880px]">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{accessError}</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-[880px]">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error ?? 'Profil introuvable.'}</div>
      </div>
    );
  }

  const statusCards: Array<{ key: 'all' | MissionStatus; label: string; count: number; color: string }> = [
    { key: 'all', label: 'Toutes', count: manageableMissions.length, color: '#0f172a' },
    { key: 'draft', label: 'Brouillons', count: scopedMissionCountsByStatus.draft, color: '#b45309' },
    { key: 'proposed', label: 'Proposées', count: scopedMissionCountsByStatus.proposed, color: '#2563eb' },
    { key: 'confirmed', label: 'Confirmées', count: scopedMissionCountsByStatus.confirmed, color: '#059669' },
    ...(scopedMissionCountsByStatus.closed > 0
      ? [{ key: 'closed' as MissionStatus, label: 'Clôturées', count: scopedMissionCountsByStatus.closed, color: '#64748b' }]
      : []),
    ...(scopedMissionCountsByStatus.cancelled > 0
      ? [{ key: 'cancelled' as MissionStatus, label: 'Annulées', count: scopedMissionCountsByStatus.cancelled, color: '#dc2626' }]
      : [])
  ];

  return (
    <div className="mx-auto w-full max-w-[880px]">
      {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.01em] text-[#0f172a]">Gestion des missions</h1>
          <p className="mt-1 text-sm text-[#64748b]">
            {filteredMissions.length} mission{filteredMissions.length > 1 ? 's' : ''} affichée{filteredMissions.length > 1 ? 's' : ''} sur {missions.length}
          </p>
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/admin/missions/import')}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Importer des missions
            </button>
            <NewMissionSplitButton />
          </div>
        ) : null}
      </div>

      {/* Sous-mode */}
      <div className="mt-4 inline-flex rounded-full border border-[#e2e8f0] bg-white p-1">
        {(['timeline', 'table'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => updateParams({ view: mode })}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${
              view === mode ? 'bg-[#0f172a] text-white' : 'text-[#475569] hover:bg-slate-50'
            }`}
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
              className={`flex-1 basis-[150px] rounded-[14px] bg-white px-4 py-[14px] text-left transition ${
                active ? 'border-[1.5px] border-[#0f172a] shadow-[0_2px_8px_rgba(15,23,42,0.06)]' : 'border border-[#e7e9ee]'
              }`}
            >
              <div className="text-[26px] font-bold leading-none" style={{ color: card.color }}>
                {card.count}
              </div>
              <div className={`mt-1.5 text-[12.5px] font-semibold ${active ? 'text-[#0f172a]' : 'text-[#64748b]'}`}>{card.label}</div>
            </button>
          );
        })}
      </div>

      {/* Chips par type */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => updateParams({ type: 'all' })}
          className={`inline-flex items-center gap-2 rounded-full px-[13px] py-1.5 text-[13px] transition ${
            selectedTypeId === 'all' ? 'border border-[#0f172a] bg-[#0f172a] font-semibold text-white' : 'border border-[#e2e8f0] bg-white font-medium text-[#475569]'
          }`}
        >
          <span className="h-[7px] w-[7px] rounded-full bg-[#94a3b8]" />
          Tous les types
        </button>
        {visibleMissionTypes.map((missionType) => {
          const active = selectedTypeId === missionType.id;
          return (
            <button
              key={missionType.id}
              type="button"
              onClick={() => updateParams({ type: missionType.id })}
              className={`inline-flex items-center gap-2 rounded-full px-[13px] py-1.5 text-[13px] transition ${
                active ? 'border border-[#0f172a] bg-[#0f172a] font-semibold text-white' : 'border border-[#e2e8f0] bg-white font-medium text-[#475569]'
              }`}
            >
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: typeColorById.get(missionType.id) ?? '#64748b' }} />
              {missionType.name} {scopedMissionCountsByTypeId[missionType.id] ?? 0}
            </button>
          );
        })}
      </div>

      {/* Recherche */}
      <input
        type="search"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Rechercher une mission"
        className="mt-3 w-full rounded-full border border-[#e2e8f0] bg-white px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
      />

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
        />
      )}
    </div>
  );
}
