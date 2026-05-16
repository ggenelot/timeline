'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MissionCard } from '@/components/missions/mission-card';
import { NewMissionSplitButton } from '@/components/missions/new-mission-split-button';
import { supabase } from '@/lib/supabase/client';
import { Mission, MissionProposal, MissionRequiredSkill, MissionStatus, Profile, RoleBehavior } from '@/lib/types';
import { SkillCode } from '@/lib/skills';
import { MISSION_STATUS_LABELS } from '@/lib/missions';

type MissionType = { id: string; name: string };

type MissionWithRequiredSkills = Mission & {
  mission_required_skills: MissionRequiredSkill[] | null;
};

const STATUS_FILTER_VALUES: Array<'all' | MissionStatus> = ['all', 'draft', 'proposed', 'closed', 'confirmed', 'cancelled'];
const STATUS_FILTER_OPTIONS: MissionStatus[] = ['draft', 'proposed', 'confirmed', 'closed', 'cancelled'];

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

export default function MissionsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [missions, setMissions] = useState<MissionWithRequiredSkills[]>([]);
  const [missionTypes, setMissionTypes] = useState<MissionType[]>([]);
  const [proposals, setProposals] = useState<MissionProposal[]>([]);
  const [canCreateMissionTypeIds, setCanCreateMissionTypeIds] = useState<string[]>([]);
  const [canManageMissionTypeIds, setCanManageMissionTypeIds] = useState<string[]>([]);
  const [proposalStatsByMission, setProposalStatsByMission] = useState<
    Map<
      string,
      {
        availableCount: number;
        unavailableCount: number;
        availableVolunteers: Array<{ name: string; skills: Array<{ name: string; category: string | null }> }>;
      }
    >
  >(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const missionTypeIds = useMemo(() => missionTypes.map((t) => t.id), [missionTypes]);
  const selectedTypeId = useMemo(() => parseTypeFilter(searchParams.get('type'), missionTypeIds), [searchParams, missionTypeIds]);
  const selectedStatus = useMemo(() => parseStatusFilter(searchParams.get('status')), [searchParams]);

  function updateMainFilters(nextTypeId: 'all' | string, nextStatus: 'all' | MissionStatus) {
    const params = new URLSearchParams(searchParams.toString());

    if (nextTypeId === 'all') {
      params.delete('type');
    } else {
      params.set('type', nextTypeId);
    }

    if (nextStatus === 'all') {
      params.delete('status');
    } else {
      params.set('status', nextStatus);
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  async function loadData() {
    setError(null);

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      router.replace('/login');
      return;
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('id,full_name,email,role,sector,created_at')
      .eq('id', authData.user.id)
      .single();

    if (!profileData) {
      setError('Profil introuvable.');
      setLoading(false);
      return;
    }

    setProfile(profileData);

    const { data: sessionData } = await supabase.auth.getSession();
    const tok = sessionData.session?.access_token ?? '';

    // Fetch all mission types
    let allTypeIds: string[] = [];
    const typesRes = await fetch('/api/mission-types', { headers: { Authorization: `Bearer ${tok}` } });
    if (typesRes.ok) {
      const typesJson = (await typesRes.json()) as { missionTypes: MissionType[] };
      setMissionTypes(typesJson.missionTypes);
      allTypeIds = typesJson.missionTypes.map((t) => t.id);
    }

    if (profileData.role === 'benevole') {
      const rolesRes = await fetch('/api/roles/mine', { headers: { Authorization: `Bearer ${tok}` } });
      if (rolesRes.ok) {
        const rolesJson = (await rolesRes.json()) as { behaviors: RoleBehavior[] };

        const canCreateBehaviors = rolesJson.behaviors.filter((b) => b.behavior_type === 'can_create');
        const createIds = canCreateBehaviors.some((b) => (b.mission_type_ids ?? []).length === 0)
          ? allTypeIds
          : Array.from(new Set(canCreateBehaviors.flatMap((b) => b.mission_type_ids ?? [])));

        const canManageBehaviors = rolesJson.behaviors.filter((b) => b.behavior_type === 'can_manage');
        const manageIds = canManageBehaviors.some((b) => (b.mission_type_ids ?? []).length === 0)
          ? allTypeIds
          : Array.from(new Set(canManageBehaviors.flatMap((b) => b.mission_type_ids ?? [])));

        setCanCreateMissionTypeIds(createIds);
        setCanManageMissionTypeIds(manageIds);
      }
    }

    let missionQuery = supabase
      .from('missions')
      .select(
        'id,title,description,location,mission_type_id,starts_at,ends_at,required_volunteers,status,created_by,created_at,mission_required_skills(id,mission_id,skill_id,quantity,created_at,skill:skills(id,name))'
      );

    if (profileData.role === 'benevole') {
      // RLS already filters: proposed missions + own drafts — no extra filter needed
    }

    const { data: missionData, error: missionError } = await missionQuery.order('starts_at', { ascending: true });

    if (missionError) {
      setError(`Erreur chargement missions: ${missionError.message}`);
      setLoading(false);
      return;
    }

    const mappedMissions: MissionWithRequiredSkills[] = (missionData ?? []).map((mission) => ({
      ...mission,
      mission_required_skills: (mission.mission_required_skills ?? []).map((requiredSkill) => ({
        ...requiredSkill,
        skill: Array.isArray(requiredSkill.skill) ? requiredSkill.skill[0] ?? null : requiredSkill.skill
      }))
    }));

    setMissions(mappedMissions);

    const { data: proposalData } = await supabase
      .from('mission_proposals')
      .select('id,mission_id,volunteer_id,proposed_by,response,status,decided_at,decided_by,updated_by_admin,updated_by,updated_at,source,created_at')
      .in(
        'mission_id',
        mappedMissions.map((mission) => mission.id)
      );

    const allMissionProposals = proposalData ?? [];
    setProposals(allMissionProposals.filter((proposal) => proposal.volunteer_id === authData.user.id));

    const availableVolunteerIds = Array.from(
      new Set(allMissionProposals.filter((proposal) => proposal.response === 'available').map((proposal) => proposal.volunteer_id))
    );

    const { data: availableProfiles } = availableVolunteerIds.length
      ? await supabase
        .from('profiles')
        .select('id,full_name,profile_skills(skill:skills(name,category))')
        .in('id', availableVolunteerIds)
      : { data: [] };

    const volunteersById = new Map(
      (availableProfiles ?? []).map((profile) => [
        profile.id,
        {
          name: profile.full_name?.trim() || 'Sans nom',
          skills: (
            (profile.profile_skills ?? []) as Array<{
              skill?: { name?: string; category?: string | null } | Array<{ name?: string; category?: string | null }> | null;
            }>
          )
            .map((profileSkill) => (Array.isArray(profileSkill.skill) ? profileSkill.skill[0] : profileSkill.skill) ?? null)
            .filter((skill): skill is { name?: string; category?: string | null } => Boolean(skill?.name))
            .map((skill) => ({ name: skill.name ?? 'Compétence sans nom', category: skill.category ?? null }))
        }
      ])
    );
    const nextProposalStats = new Map<
      string,
      {
        availableCount: number;
        unavailableCount: number;
        availableVolunteers: Array<{ name: string; skills: Array<{ name: string; category: string | null }> }>;
      }
    >();

    allMissionProposals.forEach((proposal) => {
      const current = nextProposalStats.get(proposal.mission_id) ?? { availableCount: 0, unavailableCount: 0, availableVolunteers: [] };

      if (proposal.response === 'available') {
        current.availableCount += 1;
        current.availableVolunteers.push(volunteersById.get(proposal.volunteer_id) ?? { name: 'Sans nom', skills: [] });
      }

      if (proposal.response === 'unavailable') {
        current.unavailableCount += 1;
      }

      nextProposalStats.set(proposal.mission_id, current);
    });

    setProposalStatsByMission(nextProposalStats);
    setLoading(false);
  }

  async function publishDraftMission(missionId: string) {
    setError(null);

    const { error: updateError } = await supabase.from('missions').update({ status: 'proposed' }).eq('id', missionId).eq('status', 'draft');

    if (updateError) {
      setError(`Impossible de passer la mission en proposé : ${updateError.message}`);
      return;
    }

    await loadData();
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const proposalByMission = useMemo(
    () => new Map(proposals.map((proposal) => [proposal.mission_id, proposal])),
    [proposals]
  );

  const effectiveSelectedStatus =
    profile?.role === 'benevole' && selectedStatus !== 'all' && selectedStatus !== 'proposed' ? 'all' : selectedStatus;

  const missionCountsByTypeId = useMemo(
    () =>
      missions.reduce<Record<string, number>>((counts, mission) => {
        counts[mission.mission_type_id] = (counts[mission.mission_type_id] ?? 0) + 1;
        return counts;
      }, {}),
    [missions]
  );

  const missionTypeById = useMemo(
    () => new Map(missionTypes.map((t) => [t.id, t])),
    [missionTypes]
  );

  const missionCountsByStatus = useMemo(
    () =>
      missions.reduce<Record<MissionStatus, number>>(
        (counts, mission) => {
          counts[mission.status] += 1;
          return counts;
        },
        { draft: 0, proposed: 0, confirmed: 0, closed: 0, cancelled: 0 }
      ),
    [missions]
  );

  const filteredMissions = useMemo(
    () =>
      missions.filter((mission) => {
        const normalizedSearch = searchQuery.trim().toLocaleLowerCase('fr-FR');

        if (normalizedSearch.length > 0) {
          const searchableContent = [mission.title, mission.description, mission.location]
            .filter((value): value is string => Boolean(value))
            .join(' ')
            .toLocaleLowerCase('fr-FR');

          if (!searchableContent.includes(normalizedSearch)) {
            return false;
          }
        }

        if (selectedTypeId !== 'all' && mission.mission_type_id !== selectedTypeId) {
          return false;
        }

        if (effectiveSelectedStatus !== 'all' && mission.status !== effectiveSelectedStatus) {
          return false;
        }

        return true;
      }),
    [
      missions,
      searchQuery,
      selectedTypeId,
      effectiveSelectedStatus
    ]
  );

  const prioritizedMissions = useMemo(() => {
    if (profile?.role !== 'benevole') {
      return { pendingResponse: [] as MissionWithRequiredSkills[], others: filteredMissions };
    }

    const pendingResponse = filteredMissions.filter((mission) => !proposalByMission.has(mission.id));
    const others = filteredMissions.filter((mission) => proposalByMission.has(mission.id));

    return { pendingResponse, others };
  }, [filteredMissions, proposalByMission, profile?.role]);

  if (loading) {
    return <p className="text-sm text-slate-600">Chargement des missions...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Missions</h1>
            {profile?.role === 'admin' ? (
              <>
                <p className="mt-1 text-sm text-slate-600">
                  Connecté en tant que <span className="font-medium">{profile?.full_name ?? profile?.email ?? 'Utilisateur'}</span> ({profile?.role ?? 'profil incomplet'})
                </p>
                <p className="mt-1 text-xs text-slate-500">{filteredMissions.length} mission(s) affichée(s) / {missions.length}</p>
              </>
            ) : null}
          </div>
          {profile?.role === 'admin' ? (
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
          ) : profile?.role === 'benevole' && canCreateMissionTypeIds.length > 0 ? (
            <button
              type="button"
              onClick={() => router.push('/missions/create')}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Proposer une mission
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="space-y-3">
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Rechercher une mission"
            className="w-full rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-700 placeholder:text-slate-500 focus:border-emerald-500 focus:bg-white focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => updateMainFilters('all', effectiveSelectedStatus)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                selectedTypeId === 'all'
                  ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                  : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Toutes {missions.length}
            </button>
            {missionTypes.map((mt) => (
              <button
                key={mt.id}
                type="button"
                onClick={() => updateMainFilters(mt.id, effectiveSelectedStatus)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                  selectedTypeId === mt.id
                    ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {mt.name} {missionCountsByTypeId[mt.id] ?? 0}
              </button>
            ))}
          </div>
          {profile?.role === 'admin' ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => updateMainFilters(selectedTypeId, 'all')}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                  effectiveSelectedStatus === 'all'
                    ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Tous statuts {missions.length}
              </button>
              {STATUS_FILTER_OPTIONS.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => updateMainFilters(selectedTypeId, status)}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                    effectiveSelectedStatus === status
                      ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                      : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {MISSION_STATUS_LABELS[status]} {missionCountsByStatus[status]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <div className="space-y-3">
        {/* Draft missions created by this volunteer — awaiting admin validation */}
        {profile?.role === 'benevole' && missions.filter((m) => m.status === 'draft' && m.created_by === profile.id).length > 0 ? (
          <section className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
            <h2 className="text-sm font-semibold text-amber-900">
              Mes propositions en attente de validation ({missions.filter((m) => m.status === 'draft' && m.created_by === profile.id).length})
            </h2>
            {missions.filter((m) => m.status === 'draft' && m.created_by === profile.id).map((mission) => (
              <div key={mission.id}>
                <MissionCard
                  mission={mission}
                  missionTypeName={missionTypeById.get(mission.mission_type_id)?.name}
                  requiredSkills={mission.mission_required_skills ?? []}
                  currentUserId={profile.id}
                  canPropose={false}
                  proposalResponse={null}
                  canEdit={false}
                  availableVolunteersCount={0}
                  unavailableVolunteersCount={0}
                  availableVolunteers={[]}
                />
              </div>
            ))}
          </section>
        ) : null}

        {profile?.role === 'benevole' && prioritizedMissions.pendingResponse.length > 0 ? (
          <section className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
            <h2 className="text-sm font-semibold text-emerald-900">Nouvelles missions ({prioritizedMissions.pendingResponse.length})</h2>
            {prioritizedMissions.pendingResponse.map((mission) => (
              <div key={mission.id}>
                <MissionCard
                  mission={mission}
                  missionTypeName={missionTypeById.get(mission.mission_type_id)?.name}
                  requiredSkills={mission.mission_required_skills ?? []}
                  currentUserId={profile?.id ?? ''}
                  canPropose={profile?.role === 'benevole'}
                  proposalResponse={proposalByMission.get(mission.id)?.response ?? null}
                  canEdit={profile?.role === 'admin' || canManageMissionTypeIds.includes(mission.mission_type_id)}
                  availableVolunteersCount={proposalStatsByMission.get(mission.id)?.availableCount ?? 0}
                  unavailableVolunteersCount={proposalStatsByMission.get(mission.id)?.unavailableCount ?? 0}
                  availableVolunteers={proposalStatsByMission.get(mission.id)?.availableVolunteers ?? []}
                  onPublishDraft={profile?.role === 'admin' ? publishDraftMission : undefined}
                  onResponse={() => void loadData()}
                />
              </div>
            ))}
          </section>
        ) : null}

        {(profile?.role === 'benevole' ? prioritizedMissions.others : filteredMissions).map((mission) => (
          <div key={mission.id}>
            <MissionCard
              mission={mission}
              missionTypeName={missionTypeById.get(mission.mission_type_id)?.name}
              requiredSkills={mission.mission_required_skills ?? []}
              currentUserId={profile?.id ?? ''}
              canPropose={profile?.role === 'benevole'}
              proposalResponse={proposalByMission.get(mission.id)?.response ?? null}
              canEdit={profile?.role === 'admin' || canManageMissionTypeIds.includes(mission.mission_type_id)}
              availableVolunteersCount={proposalStatsByMission.get(mission.id)?.availableCount ?? 0}
              unavailableVolunteersCount={proposalStatsByMission.get(mission.id)?.unavailableCount ?? 0}
              availableVolunteers={proposalStatsByMission.get(mission.id)?.availableVolunteers ?? []}
              onPublishDraft={profile?.role === 'admin' ? publishDraftMission : undefined}
              onResponse={() => void loadData()}
            />
          </div>
        ))}

        {missions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            Aucune mission disponible pour le moment.
          </div>
        ) : filteredMissions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            Aucun résultat avec les filtres sélectionnés.
          </div>
        ) : null}
      </div>
    </div>
  );
}
