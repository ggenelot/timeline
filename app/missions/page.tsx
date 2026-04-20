'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { MissionCard } from '@/components/missions/mission-card';
import { supabase } from '@/lib/supabase/client';
import { Mission, MissionProposal, MissionRequiredSkill, Profile } from '@/lib/types';
import { buildExpandedSkillSet, compareSkillCodes, getSkillLabel, SkillCode } from '@/lib/skills';

type MissionWithRequiredSkills = Mission & {
  mission_required_skills: MissionRequiredSkill[] | null;
};

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

  const router = useRouter();

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
        'id,title,description,location,sector,starts_at,ends_at,required_volunteers,status,created_by,created_at,mission_required_skills(mission_id,skill_id,created_at,skill:skills(id,name))'
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

    setMissions(mappedMissions);

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

        return true;
      }),
    [missions, selectedSector, dateFrom, dateTo, selectedRequiredSkillCode]
  );

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
        <h2 className="text-sm font-semibold text-slate-900">Filtres</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
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
            />
            {(mission.mission_required_skills ?? []).length > 0 ? (
              <p className="px-1 text-xs text-slate-600">
                Compétences requises:{' '}
                {(() => {
                  const explicitSkillNames = (mission.mission_required_skills ?? [])
                    .map((requiredSkill) => requiredSkill.skill?.name)
                    .filter((skillName): skillName is string => Boolean(skillName));

                  const expandedSkills = Array.from(buildExpandedSkillSet(explicitSkillNames))
                    .sort(compareSkillCodes)
                    .map((skillCode) => getSkillLabel(skillCode));

                  return expandedSkills.join(', ');
                })()}
              </p>
            ) : null}
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
