'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MissionCard } from '@/components/missions/mission-card';
import { MissionTimelineCard } from '@/components/missions/mission-timeline-card';
import { NewMissionSplitButton } from '@/components/missions/new-mission-split-button';
import { supabase } from '@/lib/supabase/client';
import { Mission, MissionProposal, MissionRequiredSkill, MissionStatus, Profile, RoleBehavior } from '@/lib/types';
import {
  groupMissionsByMonth,
  MISSION_STATUS_NODE_COLOR,
  MissionRelation,
  relationForProposal,
  resolveMissionTypeColor
} from '@/lib/mission-timeline';

type MissionType = { id: string; name: string; color?: string | null };

type MissionWithRequiredSkills = Mission & {
  mission_required_skills: MissionRequiredSkill[] | null;
};

type BenevoleStatusFilter = 'all' | 'pending' | 'engaged' | 'retenu';

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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function TimelineNode({ relation, typeColor }: { relation: MissionRelation; typeColor: string }) {
  const shadow = '0 0 0 4px #f1f5f9';
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
        className={`${base} rounded-full bg-white`}
        style={{ ...position, width: 16, height: 16, border: '3px solid #059669', boxShadow: shadow }}
      />
    );
  }

  if (relation === 'declined') {
    return (
      <span
        className={`${base} rounded-full`}
        style={{ ...position, width: 14, height: 14, background: '#f1f5f9', border: '2px solid #cbd5e1', boxShadow: shadow }}
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

export default function MissionsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [missions, setMissions] = useState<MissionWithRequiredSkills[]>([]);
  const [missionTypes, setMissionTypes] = useState<MissionType[]>([]);
  const [proposals, setProposals] = useState<MissionProposal[]>([]);
  const [retainedMissionIds, setRetainedMissionIds] = useState<Set<string>>(new Set());
  const [canCreateMissionTypeIds, setCanCreateMissionTypeIds] = useState<string[]>([]);
  const [canManageMissionTypeIds, setCanManageMissionTypeIds] = useState<string[]>([]);
  const [proposalStatsByMission, setProposalStatsByMission] = useState<
    Map<
      string,
      {
        availableCount: number;
        unavailableCount: number;
        availableVolunteers: Array<{ name: string; skills: Array<{ name: string; color?: string | null }> }>;
      }
    >
  >(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [benevoleStatusFilter, setBenevoleStatusFilter] = useState<BenevoleStatusFilter>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
        'id,title,description,location,mission_type_id,starts_at,ends_at,required_volunteers,status,created_by,created_at,mission_required_skills(id,mission_id,skill_id,quantity,created_at,skill:skills(id,name,category_id,display_order))'
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

    // My retained (selected/confirmed) assignments → "retenu" relation
    const { data: assignmentData } = await supabase
      .from('mission_assignments')
      .select('mission_id,assignment_status')
      .eq('volunteer_id', authData.user.id);

    setRetainedMissionIds(
      new Set(
        (assignmentData ?? [])
          .filter((row) => row.assignment_status === 'selected' || row.assignment_status === 'confirmed')
          .map((row) => row.mission_id)
      )
    );

    const availableVolunteerIds = Array.from(
      new Set(allMissionProposals.filter((proposal) => proposal.response === 'available').map((proposal) => proposal.volunteer_id))
    );

    const { data: availableProfiles } = availableVolunteerIds.length
      ? await supabase
        .from('profiles')
        .select('id,full_name,profile_skills(skill:skills(name,skill_categories(color)))')
        .in('id', availableVolunteerIds)
      : { data: [] };

    const volunteersById = new Map(
      (availableProfiles ?? []).map((profile) => [
        profile.id,
        {
          name: profile.full_name?.trim() || 'Sans nom',
          skills: (
            (profile.profile_skills ?? []) as Array<{
              skill?: { name?: string; skill_categories?: { color?: string } | null } | Array<{ name?: string; skill_categories?: { color?: string } | null }> | null;
            }>
          )
            .map((profileSkill) => (Array.isArray(profileSkill.skill) ? profileSkill.skill[0] : profileSkill.skill) ?? null)
            .filter((skill): skill is { name?: string; skill_categories?: { color?: string } | null } => Boolean(skill?.name))
            .map((skill) => ({ name: skill.name ?? 'Compétence sans nom', color: skill.skill_categories?.color ?? null }))
        }
      ])
    );
    const nextProposalStats = new Map<
      string,
      {
        availableCount: number;
        unavailableCount: number;
        availableVolunteers: Array<{ name: string; skills: Array<{ name: string; color?: string | null }> }>;
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

  const typeColorById = useMemo(
    () => new Map(missionTypes.map((t) => [t.id, resolveMissionTypeColor(t.name, t.color)])),
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
    [missions, searchQuery, selectedTypeId, effectiveSelectedStatus]
  );

  // ── Bénévole timeline derivations ──────────────────────────────────────────
  const relationByMission = useMemo(() => {
    const map = new Map<string, MissionRelation>();
    missions.forEach((mission) => {
      map.set(mission.id, relationForProposal(proposalByMission.get(mission.id), retainedMissionIds.has(mission.id)));
    });
    return map;
  }, [missions, proposalByMission, retainedMissionIds]);

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

  const adminMonthGroups = useMemo(() => groupMissionsByMonth(filteredMissions), [filteredMissions]);

  if (loading) {
    return <p className="text-sm text-slate-600">Chargement des missions...</p>;
  }

  // ── Bénévole : vue frise chronologique ─────────────────────────────────────
  if (profile?.role === 'benevole') {
    const today = new Date();
    const todayLabel = today.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' });

    const draftProposals = missions.filter((mission) => mission.status === 'draft' && mission.created_by === profile.id);

    const filterCards: Array<{ key: BenevoleStatusFilter; label: string; count: number; color: string }> = [
      { key: 'all', label: 'Toutes', count: benevoleCounts.total, color: '#0f172a' },
      { key: 'pending', label: 'Réponses en attente', count: benevoleCounts.pending, color: '#b45309' },
      { key: 'engaged', label: 'Mes engagements', count: benevoleCounts.engaged, color: '#047857' },
      { key: 'retenu', label: 'Mes missions', count: benevoleCounts.retenu, color: '#059669' }
    ];

    return (
      <div className="mx-auto w-full max-w-[880px]">
        {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.01em] text-[#0f172a]">Missions</h1>
            <p className="mt-1 text-sm text-[#64748b]">
              {subtitleStats.total} mission{subtitleStats.total > 1 ? 's' : ''} proposée{subtitleStats.total > 1 ? 's' : ''} ·{' '}
              {subtitleStats.pending} en attente de votre réponse
            </p>
          </div>
          {canCreateMissionTypeIds.length > 0 ? (
            <button
              type="button"
              onClick={() => router.push('/missions/create')}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Proposer une mission
            </button>
          ) : null}
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
                className={`flex-1 basis-[160px] rounded-[14px] bg-white px-4 py-[14px] text-left transition ${
                  active
                    ? 'border-[1.5px] border-[#0f172a] shadow-[0_2px_8px_rgba(15,23,42,0.06)]'
                    : 'border border-[#e7e9ee]'
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
            onClick={() => updateMainFilters('all', 'all')}
            className={`inline-flex items-center gap-2 rounded-full px-[13px] py-1.5 text-[13px] transition ${
              selectedTypeId === 'all' ? 'border border-[#0f172a] bg-[#0f172a] font-semibold text-white' : 'border border-[#e2e8f0] bg-white font-medium text-[#475569]'
            }`}
          >
            <span className="h-[7px] w-[7px] rounded-full bg-[#94a3b8]" />
            Tous les types
          </button>
          {missionTypes.map((missionType) => {
            const active = selectedTypeId === missionType.id;
            return (
              <button
                key={missionType.id}
                type="button"
                onClick={() => updateMainFilters(missionType.id, 'all')}
                className={`inline-flex items-center gap-2 rounded-full px-[13px] py-1.5 text-[13px] transition ${
                  active ? 'border border-[#0f172a] bg-[#0f172a] font-semibold text-white' : 'border border-[#e2e8f0] bg-white font-medium text-[#475569]'
                }`}
              >
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: typeColorById.get(missionType.id) ?? '#64748b' }} />
                {missionType.name}
              </button>
            );
          })}
        </div>

        {/* Brouillons proposés par le bénévole (en attente de validation) */}
        {draftProposals.length > 0 ? (
          <section className="mt-5 space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
            <h2 className="text-sm font-semibold text-amber-900">Mes propositions en attente de validation ({draftProposals.length})</h2>
            {draftProposals.map((mission) => (
              <MissionCard
                key={mission.id}
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
            ))}
          </section>
        ) : null}

        {/* Frise */}
        <div className="relative mt-6">
          <div className="pointer-events-none absolute bottom-0 left-[23px] top-0 w-[2px] bg-[#e3e7ee]" />

          {/* Repère Aujourd'hui */}
          <div className="relative pb-6 pl-14">
            <span
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f1f5f9]"
              style={{ left: 24, top: 11, width: 12, height: 12, border: '2px solid #94a3b8' }}
            />
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#94a3b8]">Aujourd&apos;hui</span>
              <span className="text-[13px] text-[#94a3b8]">{todayLabel}</span>
            </div>
          </div>

          {monthGroups.length === 0 ? (
            <div className="ml-14 rounded-[14px] border border-dashed border-[#cbd5e1] bg-white p-7 text-center text-sm text-[#94a3b8]">
              Aucune mission dans cette catégorie.
            </div>
          ) : (
            monthGroups.map((group) => (
              <div key={group.key}>
                <div className="relative py-2 pl-14 text-[12px] font-bold uppercase tracking-[0.14em] text-[#94a3b8]">
                  {capitalize(group.label)}
                </div>
                <div className="space-y-4">
                  {group.missions.map((mission) => {
                    const relation = relationByMission.get(mission.id) ?? 'pending';
                    const typeColor = typeColorById.get(mission.mission_type_id) ?? '#64748b';
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
                          onResponse={() => void loadData()}
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

  // ── Admin / responsable : frise chronologique (sémantique statut) ──────────
  const isAdmin = profile?.role === 'admin';

  const adminStatusCards: Array<{ key: 'all' | MissionStatus; label: string; count: number; color: string }> = [
    { key: 'all', label: 'Toutes', count: missions.length, color: '#0f172a' },
    { key: 'draft', label: 'Brouillons', count: missionCountsByStatus.draft, color: '#b45309' },
    { key: 'proposed', label: 'Proposées', count: missionCountsByStatus.proposed, color: '#2563eb' },
    { key: 'confirmed', label: 'Confirmées', count: missionCountsByStatus.confirmed, color: '#059669' },
    ...(missionCountsByStatus.closed > 0
      ? [{ key: 'closed' as MissionStatus, label: 'Clôturées', count: missionCountsByStatus.closed, color: '#64748b' }]
      : []),
    ...(missionCountsByStatus.cancelled > 0
      ? [{ key: 'cancelled' as MissionStatus, label: 'Annulées', count: missionCountsByStatus.cancelled, color: '#dc2626' }]
      : [])
  ];

  return (
    <div className="mx-auto w-full max-w-[880px]">
      {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.01em] text-[#0f172a]">Missions</h1>
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

      {/* Cartes-filtres par statut */}
      <div className="mt-5 flex flex-wrap gap-3">
        {adminStatusCards.map((card) => {
          const active = effectiveSelectedStatus === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => updateMainFilters(selectedTypeId, card.key)}
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
          onClick={() => updateMainFilters('all', effectiveSelectedStatus)}
          className={`inline-flex items-center gap-2 rounded-full px-[13px] py-1.5 text-[13px] transition ${
            selectedTypeId === 'all' ? 'border border-[#0f172a] bg-[#0f172a] font-semibold text-white' : 'border border-[#e2e8f0] bg-white font-medium text-[#475569]'
          }`}
        >
          <span className="h-[7px] w-[7px] rounded-full bg-[#94a3b8]" />
          Tous les types
        </button>
        {missionTypes.map((missionType) => {
          const active = selectedTypeId === missionType.id;
          return (
            <button
              key={missionType.id}
              type="button"
              onClick={() => updateMainFilters(missionType.id, effectiveSelectedStatus)}
              className={`inline-flex items-center gap-2 rounded-full px-[13px] py-1.5 text-[13px] transition ${
                active ? 'border border-[#0f172a] bg-[#0f172a] font-semibold text-white' : 'border border-[#e2e8f0] bg-white font-medium text-[#475569]'
              }`}
            >
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: typeColorById.get(missionType.id) ?? '#64748b' }} />
              {missionType.name} {missionCountsByTypeId[missionType.id] ?? 0}
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

      {/* Frise */}
      <div className="relative mt-6">
        <div className="pointer-events-none absolute bottom-0 left-[23px] top-0 w-[2px] bg-[#e3e7ee]" />

        {missions.length === 0 ? (
          <div className="ml-14 rounded-[14px] border border-dashed border-[#cbd5e1] bg-white p-7 text-center text-sm text-[#94a3b8]">
            Aucune mission disponible pour le moment.
          </div>
        ) : adminMonthGroups.length === 0 ? (
          <div className="ml-14 rounded-[14px] border border-dashed border-[#cbd5e1] bg-white p-7 text-center text-sm text-[#94a3b8]">
            Aucun résultat avec les filtres sélectionnés.
          </div>
        ) : (
          adminMonthGroups.map((group) => (
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
                        onPublishDraft={isAdmin ? publishDraftMission : undefined}
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
