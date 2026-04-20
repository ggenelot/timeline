'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { MissionCard } from '@/components/missions/mission-card';
import { supabase } from '@/lib/supabase/client';
import { MISSION_CATEGORY_OPTIONS, Mission, MissionCategory, MissionProposal, MissionRequiredSkill, MissionStatus, Profile } from '@/lib/types';
import { buildExpandedSkillSet, compareSkillCodes, getSkillLabel, SkillCode } from '@/lib/skills';
import { formatMissionRequirementLabel } from '@/lib/missions';

type MissionWithRequiredSkills = Mission & {
  mission_required_skills: MissionRequiredSkill[] | null;
};

const CATEGORY_FILTER_VALUES: Array<'all' | MissionCategory> = ['all', ...MISSION_CATEGORY_OPTIONS.map((option) => option.value)];
const STATUS_FILTER_VALUES: Array<'all' | MissionStatus> = ['all', 'draft', 'proposed', 'closed', 'confirmed', 'cancelled'];
const VOLUNTEER_STATUS_FILTER_VALUES: Array<'all' | MissionStatus> = ['all', 'proposed', 'closed', 'confirmed', 'cancelled'];

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
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [missions, setMissions] = useState<MissionWithRequiredSkills[]>([]);
  const [proposals, setProposals] = useState<MissionProposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedSector, setSelectedSector] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedRequiredSkillCode, setSelectedRequiredSkillCode] = useState<'all' | SkillCode>('all');
  const [showOnlyMissionsWithoutResponse, setShowOnlyMissionsWithoutResponse] = useState(false);

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

    setUser(authData.user);

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

    const { data: missionData, error: missionError } = await supabase
      .from('missions')
      .select(
        'id,title,description,location,sector,category,starts_at,ends_at,required_volunteers,status,created_by,created_at,mission_required_skills(id,mission_id,skill_id,quantity,created_at,skill:skills(id,name))'
      )
      .order('starts_at', { ascending: true });

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

    const visibleMissions = profileData.role === 'benevole' ? mappedMissions.filter((mission) => mission.status !== 'draft') : mappedMissions;

    setMissions(visibleMissions);

    const { data: proposalData } = await supabase
      .from('mission_proposals')
      .select('id,mission_id,volunteer_id,proposed_by,response,status,decided_at,decided_by,created_at')
      .eq('volunteer_id', authData.user.id);

    setProposals(proposalData ?? []);
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

  const sectors = useMemo(
    () => Array.from(new Set(missions.map((mission) => mission.sector).filter((sector): sector is string => Boolean(sector)))).sort(),
    [missions]
  );

  const requiredSkills = useMemo(() => {
    const usedCodes = new Set<SkillCode>();

    missions.forEach((mission) => {
      const explicitSkillNames = (mission.mission_required_skills ?? [])
        .map((requiredSkill) => requiredSkill.skill?.name)
        .filter((skillName): skillName is string => Boolean(skillName));

      buildExpandedSkillSet(explicitSkillNames).forEach((skillCode) => usedCodes.add(skillCode));
    });

    return Array.from(usedCodes)
      .sort(compareSkillCodes)
      .map((skillCode) => ({ code: skillCode, name: getSkillLabel(skillCode) }));
  }, [missions]);

  const filteredMissions = useMemo(
    () =>
      missions.filter((mission) => {
        if (selectedCategory !== 'all' && mission.category !== selectedCategory) {
          return false;
        }

        if (selectedStatus !== 'all' && mission.status !== selectedStatus) {
          return false;
        }

        if (selectedSector !== 'all' && mission.sector !== selectedSector) {
          return false;
        }

        const missionDate = mission.starts_at.slice(0, 10);

        if (dateFrom && missionDate < dateFrom) {
          return false;
        }

        if (dateTo && missionDate > dateTo) {
          return false;
        }

        if (selectedRequiredSkillCode !== 'all') {
          const explicitSkillNames = (mission.mission_required_skills ?? [])
            .map((requiredSkill) => requiredSkill.skill?.name)
            .filter((skillName): skillName is string => Boolean(skillName));

          const expandedSkillSet = buildExpandedSkillSet(explicitSkillNames);

          if (!expandedSkillSet.has(selectedRequiredSkillCode)) {
            return false;
          }
        }

        if (profile?.role === 'benevole' && showOnlyMissionsWithoutResponse && proposalByMission.has(mission.id)) {
          return false;
        }

        return true;
      }),
    [missions, selectedCategory, selectedStatus, selectedSector, dateFrom, dateTo, selectedRequiredSkillCode, profile?.role, showOnlyMissionsWithoutResponse, proposalByMission]
  );

  const availableStatusFilters = profile?.role === 'benevole' ? VOLUNTEER_STATUS_FILTER_VALUES : STATUS_FILTER_VALUES;

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
              <Link
                href="/admin/volunteers"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Ajouter un bénévole
              </Link>
              <Link
                href="/admin/missions/create"
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                Nouvelle mission
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Filtres</h2>
          <button
            type="button"
            onClick={() => {
              updateMainFilters('all', 'all');
              setSelectedSector('all');
              setDateFrom('');
              setDateTo('');
              setSelectedRequiredSkillCode('all');
              setShowOnlyMissionsWithoutResponse(false);
            }}
            className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
          >
            Réinitialiser les filtres
          </button>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm text-slate-700">
            Catégorie
            <select
              value={selectedCategory}
              onChange={(event) => updateMainFilters(event.target.value as 'all' | MissionCategory, selectedStatus)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="all">Toutes</option>
              {MISSION_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700">
            Statut
            <select
              value={selectedStatus}
              onChange={(event) => updateMainFilters(selectedCategory, event.target.value as 'all' | MissionStatus)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="all">Tous</option>
              {availableStatusFilters.includes('draft') ? <option value="draft">Brouillon</option> : null}
              {availableStatusFilters.includes('proposed') ? <option value="proposed">Proposée</option> : null}
              {availableStatusFilters.includes('closed') ? <option value="closed">Clôturée</option> : null}
              {availableStatusFilters.includes('confirmed') ? <option value="confirmed">Confirmée</option> : null}
              {availableStatusFilters.includes('cancelled') ? <option value="cancelled">Annulée</option> : null}
            </select>
          </label>

          <label className="text-sm text-slate-700">
            Secteur
            <select
              value={selectedSector}
              onChange={(event) => setSelectedSector(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="all">Tous les secteurs</option>
              {sectors.map((sector) => (
                <option key={sector} value={sector}>
                  {sector}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700">
            Date début min
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="text-sm text-slate-700">
            Date début max
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="text-sm text-slate-700">
            Compétence requise
            <select
              value={selectedRequiredSkillCode}
              onChange={(event) => setSelectedRequiredSkillCode((event.target.value as SkillCode | 'all'))}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="all">Toutes</option>
              {requiredSkills.map((skill) => (
                <option key={skill.code} value={skill.code}>
                  {skill.name}
                </option>
              ))}
            </select>
          </label>

          {profile?.role === 'benevole' ? (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={showOnlyMissionsWithoutResponse}
                onChange={(event) => setShowOnlyMissionsWithoutResponse(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
              />
              Missions sans réponse
            </label>
          ) : null}
        </div>
      </section>

      <div className="space-y-3">
        {filteredMissions.map((mission) => (
          <div key={mission.id} className="space-y-2">
            <MissionCard
              mission={mission}
              currentUserId={profile?.id ?? ''}
              canPropose={profile?.role === 'benevole'}
              proposalStatus={proposalByMission.get(mission.id)?.status ?? null}
              proposalResponse={proposalByMission.get(mission.id)?.response ?? null}
              canEdit={profile?.role === 'admin'}
            />
            {(mission.mission_required_skills ?? []).length > 0 ? (
              <div className="flex flex-wrap gap-1 px-1">
                {(mission.mission_required_skills ?? []).map((requiredSkill) => (
                  <span key={requiredSkill.id} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
                    {formatMissionRequirementLabel(requiredSkill.skill?.name, requiredSkill.quantity)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}

        {missions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            Aucune mission disponible pour le moment.
          </div>
        ) : filteredMissions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            {profile?.role === 'benevole' && showOnlyMissionsWithoutResponse
              ? 'Vous avez déjà répondu à toutes les missions affichées.'
              : 'Aucun résultat avec les filtres sélectionnés.'}
          </div>
        ) : null}
      </div>
    </div>
  );
}
