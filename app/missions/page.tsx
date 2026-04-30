'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MissionCard } from '@/components/missions/mission-card';
import { NewMissionSplitButton } from '@/components/missions/new-mission-split-button';
import { supabase } from '@/lib/supabase/client';
import { MISSION_CATEGORY_OPTIONS, Mission, MissionCategory, MissionProposal, MissionRequiredSkill, MissionStatus, Profile } from '@/lib/types';
import { SkillCode } from '@/lib/skills';
import { formatMissionRequirementLabel } from '@/lib/missions';

type MissionWithRequiredSkills = Mission & {
  mission_required_skills: MissionRequiredSkill[] | null;
};

const CATEGORY_FILTER_VALUES: Array<'all' | MissionCategory> = ['all', ...MISSION_CATEGORY_OPTIONS.map((option) => option.value)];
const STATUS_FILTER_VALUES: Array<'all' | MissionStatus> = ['all', 'draft', 'proposed', 'closed', 'confirmed', 'cancelled'];

function parseCategoryFilter(value: string | null): 'all' | MissionCategory {
  if (value && CATEGORY_FILTER_VALUES.includes(value as 'all' | MissionCategory)) {
    return value as 'all' | MissionCategory;
  }
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
  const [proposals, setProposals] = useState<MissionProposal[]>([]);
  const [proposalStatsByMission, setProposalStatsByMission] = useState<
    Map<string, { availableCount: number; unavailableCount: number; availableVolunteerNames: string[] }>
  >(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedCategory = useMemo(() => parseCategoryFilter(searchParams.get('category')), [searchParams]);
  const selectedStatus = useMemo(() => parseStatusFilter(searchParams.get('status')), [searchParams]);

  function updateMainFilters(nextCategory: 'all' | MissionCategory, nextStatus: 'all' | MissionStatus) {
    const params = new URLSearchParams(searchParams.toString());

    if (nextCategory === 'all') {
      params.delete('category');
    } else {
      params.set('category', nextCategory);
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
      .select('id,full_name,email,phone,role,sector,created_at')
      .eq('id', authData.user.id)
      .single();

    if (!profileData) {
      setError('Profil introuvable.');
      setLoading(false);
      return;
    }

    setProfile(profileData);

    let missionQuery = supabase
      .from('missions')
      .select(
        'id,title,description,location,sector,category,starts_at,ends_at,required_volunteers,status,created_by,created_at,mission_required_skills(id,mission_id,skill_id,quantity,created_at,skill:skills(id,name))'
      );

    if (profileData.role === 'benevole') {
      missionQuery = missionQuery.eq('status', 'proposed');
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
      ? await supabase.from('profiles').select('id,full_name').in('id', availableVolunteerIds)
      : { data: [] };

    const namesByVolunteerId = new Map((availableProfiles ?? []).map((profile) => [profile.id, profile.full_name?.trim() || 'Sans nom']));
    const nextProposalStats = new Map<string, { availableCount: number; unavailableCount: number; availableVolunteerNames: string[] }>();

    allMissionProposals.forEach((proposal) => {
      const current = nextProposalStats.get(proposal.mission_id) ?? { availableCount: 0, unavailableCount: 0, availableVolunteerNames: [] };

      if (proposal.response === 'available') {
        current.availableCount += 1;
        current.availableVolunteerNames.push(namesByVolunteerId.get(proposal.volunteer_id) ?? 'Sans nom');
      }

      if (proposal.response === 'unavailable') {
        current.unavailableCount += 1;
      }

      nextProposalStats.set(proposal.mission_id, current);
    });

    setProposalStatsByMission(nextProposalStats);
    setLoading(false);
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

  const missionCountsByCategory = useMemo(
    () =>
      missions.reduce<Record<MissionCategory, number>>(
        (counts, mission) => {
          counts[mission.category] += 1;
          return counts;
        },
        { maraude: 0, garde: 0, formation: 0, vie_antenne: 0, poste_de_secours: 0 }
      ),
    [missions]
  );

  const filteredMissions = useMemo(
    () =>
      missions.filter((mission) => {
        const normalizedSearch = searchQuery.trim().toLocaleLowerCase('fr-FR');

        if (normalizedSearch.length > 0) {
          const searchableContent = [mission.title, mission.description, mission.location, mission.sector]
            .filter((value): value is string => Boolean(value))
            .join(' ')
            .toLocaleLowerCase('fr-FR');

          if (!searchableContent.includes(normalizedSearch)) {
            return false;
          }
        }

        if (selectedCategory !== 'all' && mission.category !== selectedCategory) {
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
      selectedCategory,
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
            <p className="mt-1 text-sm text-slate-600">
              Connecté en tant que <span className="font-medium">{profile?.full_name ?? user?.email}</span> ({profile?.role ?? 'profil incomplet'})
            </p>
            <p className="mt-1 text-xs text-slate-500">{filteredMissions.length} mission(s) affichée(s) / {missions.length}</p>
          </div>
          {profile?.role === 'admin' ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/admin/volunteers')}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Ajouter un bénévole
              </button>
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
                selectedCategory === 'all'
                  ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                  : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Toutes {missions.length}
            </button>
            {MISSION_CATEGORY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => updateMainFilters(option.value, effectiveSelectedStatus)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                  selectedCategory === option.value
                    ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {option.label} {missionCountsByCategory[option.value]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="space-y-3">
        {profile?.role === 'benevole' && prioritizedMissions.pendingResponse.length > 0 ? (
          <section className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
            <h2 className="text-sm font-semibold text-emerald-900">Nouvelles missions ({prioritizedMissions.pendingResponse.length})</h2>
            {prioritizedMissions.pendingResponse.map((mission) => (
              <div key={mission.id}>
                <MissionCard
                  mission={mission}
                  requiredSkills={mission.mission_required_skills ?? []}
                  formatMissionRequirementLabel={formatMissionRequirementLabel}
                  currentUserId={profile?.id ?? ''}
                  canPropose={profile?.role === 'benevole'}
                  proposalResponse={proposalByMission.get(mission.id)?.response ?? null}
                  canEdit={profile?.role === 'admin'}
                  availableVolunteersCount={proposalStatsByMission.get(mission.id)?.availableCount ?? 0}
                  unavailableVolunteersCount={proposalStatsByMission.get(mission.id)?.unavailableCount ?? 0}
                  availableVolunteerNames={proposalStatsByMission.get(mission.id)?.availableVolunteerNames ?? []}
                />
              </div>
            ))}
          </section>
        ) : null}

        {(profile?.role === 'benevole' ? prioritizedMissions.others : filteredMissions).map((mission) => (
          <div key={mission.id}>
            <MissionCard
              mission={mission}
              requiredSkills={mission.mission_required_skills ?? []}
              formatMissionRequirementLabel={formatMissionRequirementLabel}
              currentUserId={profile?.id ?? ''}
              canPropose={profile?.role === 'benevole'}
              proposalResponse={proposalByMission.get(mission.id)?.response ?? null}
              canEdit={profile?.role === 'admin'}
              availableVolunteersCount={proposalStatsByMission.get(mission.id)?.availableCount ?? 0}
              unavailableVolunteersCount={proposalStatsByMission.get(mission.id)?.unavailableCount ?? 0}
              availableVolunteerNames={proposalStatsByMission.get(mission.id)?.availableVolunteerNames ?? []}
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
