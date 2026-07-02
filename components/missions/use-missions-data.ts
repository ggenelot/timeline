'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Mission, MissionProposal, MissionRequiredSkill, MissionStatus, Profile, RoleBehavior } from '@/lib/types';
import { groupMissionsByMonth, MissionRelation, relationForProposal, resolveMissionTypeColor } from '@/lib/mission-timeline';

export type MissionType = { id: string; name: string; color?: string | null };

export type MissionWithRequiredSkills = Mission & {
  mission_required_skills: MissionRequiredSkill[] | null;
};

export type VolunteerWithSkills = { name: string; skills: Array<{ name: string; color?: string | null }> };

export type ProposalStats = {
  availableCount: number;
  unavailableCount: number;
  availableVolunteers: VolunteerWithSkills[];
};

export function useMissionsData() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [missions, setMissions] = useState<MissionWithRequiredSkills[]>([]);
  const [missionTypes, setMissionTypes] = useState<MissionType[]>([]);
  const [proposals, setProposals] = useState<MissionProposal[]>([]);
  const [retainedMissionIds, setRetainedMissionIds] = useState<Set<string>>(new Set());
  const [canManageMissionTypeIds, setCanManageMissionTypeIds] = useState<string[]>([]);
  const [proposalStatsByMission, setProposalStatsByMission] = useState<Map<string, ProposalStats>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const router = useRouter();

  const loadData = useCallback(async () => {
    setError(null);

    // Single auth read (local session) instead of a network getUser() + a second
    // getSession() call. RLS still enforces access on every query below.
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session?.user) {
      router.replace('/login');
      return;
    }
    const userId = session.user.id;
    const tok = session.access_token ?? '';
    const authHeaders = { Authorization: `Bearer ${tok}` };

    // ── Wave 1 : everything that only needs the user id, in parallel ──────────
    const [profileRes, typesRes, missionsRes, assignmentsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id,full_name,email,role,sector,created_at')
        .eq('id', userId)
        .single(),
      fetch('/api/mission-types', { headers: authHeaders }),
      supabase
        .from('missions')
        .select(
          'id,title,description,location,mission_type_id,starts_at,ends_at,required_volunteers,status,created_by,created_at,mission_required_skills(id,mission_id,skill_id,quantity,created_at,skill:skills(id,name,category_id,display_order))'
        )
        .order('starts_at', { ascending: true }),
      supabase
        .from('mission_assignments')
        .select('mission_id,assignment_status')
        .eq('volunteer_id', userId)
    ]);

    const profileData = profileRes.data;
    if (!profileData) {
      setError('Profil introuvable.');
      setLoading(false);
      return;
    }
    setProfile(profileData);

    let allTypeIds: string[] = [];
    if (typesRes.ok) {
      const typesJson = (await typesRes.json()) as { missionTypes: MissionType[] };
      setMissionTypes(typesJson.missionTypes);
      allTypeIds = typesJson.missionTypes.map((t) => t.id);
    }

    if (missionsRes.error) {
      setError(`Erreur chargement missions: ${missionsRes.error.message}`);
      setLoading(false);
      return;
    }

    const mappedMissions: MissionWithRequiredSkills[] = (missionsRes.data ?? []).map((mission) => ({
      ...mission,
      mission_required_skills: (mission.mission_required_skills ?? []).map((requiredSkill) => ({
        ...requiredSkill,
        skill: Array.isArray(requiredSkill.skill) ? requiredSkill.skill[0] ?? null : requiredSkill.skill
      }))
    }));
    setMissions(mappedMissions);

    setRetainedMissionIds(
      new Set(
        (assignmentsRes.data ?? [])
          .filter((row) => row.assignment_status === 'selected' || row.assignment_status === 'confirmed')
          .map((row) => row.mission_id)
      )
    );

    // ── Wave 2 : proposals (need mission ids) + role behaviors ────────────────
    // Behaviors are needed for every role: volunteers may have can_create rights,
    // and admins/responsables need them to declare their own availability too.
    const [proposalsRes, rolesRes] = await Promise.all([
      supabase
        .from('mission_proposals')
        .select('id,mission_id,volunteer_id,proposed_by,response,status,decided_at,decided_by,updated_by_admin,updated_by,updated_at,source,created_at')
        .in('mission_id', mappedMissions.map((mission) => mission.id)),
      fetch('/api/roles/mine', { headers: authHeaders })
    ]);

    const isAdmin = profileData.role === 'admin';

    if (rolesRes.ok) {
      const rolesJson = (await rolesRes.json()) as { behaviors: RoleBehavior[] };

      const canManageBehaviors = rolesJson.behaviors.filter((b) => b.resource_type === 'mission' && b.behavior_type === 'can_manage');
      const manageIds = canManageBehaviors.some((b) => (b.mission_type_ids ?? []).length === 0)
        ? allTypeIds
        : Array.from(new Set(canManageBehaviors.flatMap((b) => b.mission_type_ids ?? [])));

      // Admin status isn't backed by role_behaviors rows, so it must be forced here
      // to keep management actions available to admins.
      setCanManageMissionTypeIds(isAdmin ? allTypeIds : manageIds);
    } else if (isAdmin) {
      setCanManageMissionTypeIds(allTypeIds);
    }

    const allMissionProposals = proposalsRes.data ?? [];
    setProposals(allMissionProposals.filter((proposal) => proposal.volunteer_id === userId));

    const availableVolunteerIds = Array.from(
      new Set(allMissionProposals.filter((proposal) => proposal.response === 'available').map((proposal) => proposal.volunteer_id))
    );

    // ── Wave 3 : skill chips for available volunteers (need their ids) ────────
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

    const nextProposalStats = new Map<string, ProposalStats>();

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
  }, [router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const publishDraftMission = useCallback(
    async (missionId: string) => {
      setError(null);

      const { error: updateError } = await supabase.from('missions').update({ status: 'proposed' }).eq('id', missionId).eq('status', 'draft');

      if (updateError) {
        setError(`Impossible de passer la mission en proposé : ${updateError.message}`);
        return;
      }

      await loadData();
    },
    [loadData]
  );

  // Bascule en masse le statut de plusieurs missions. Les transitions vers
  // "confirmed"/"cancelled" passent par les routes admin dédiées (elles
  // portent les notifications Slack et les garde-fous métier : seule une
  // mission "proposed" peut être confirmée, une mission "confirmed" ne peut
  // pas être annulée) ; les autres transitions n'ont pas d'effet de bord et
  // passent par une simple mise à jour groupée.
  const bulkUpdateMissionStatus = useCallback(
    async (missionIds: string[], targetStatus: MissionStatus): Promise<{ updatedCount: number; failedCount: number }> => {
      if (missionIds.length === 0) return { updatedCount: 0, failedCount: 0 };

      setError(null);

      const missionById = new Map(missions.map((mission) => [mission.id, mission]));
      let updatedCount = 0;
      const rawUpdateIds: string[] = [];

      if (targetStatus === 'confirmed' || targetStatus === 'cancelled') {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token ?? '';
        const endpoint = targetStatus === 'confirmed' ? 'confirm' : 'cancel';

        await Promise.all(
          missionIds.map(async (missionId) => {
            const currentStatus = missionById.get(missionId)?.status;
            const eligible =
              targetStatus === 'confirmed' ? currentStatus === 'proposed' : currentStatus !== 'confirmed' && currentStatus !== 'cancelled';
            if (!eligible) return;

            const response = await fetch(`/api/admin/missions/${missionId}/${endpoint}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) updatedCount += 1;
          })
        );
      } else {
        rawUpdateIds.push(...missionIds.filter((missionId) => missionById.get(missionId)?.status !== targetStatus));
        updatedCount += missionIds.length - rawUpdateIds.length;
      }

      if (rawUpdateIds.length > 0) {
        const { data, error: updateError } = await supabase.from('missions').update({ status: targetStatus }).in('id', rawUpdateIds).select('id');

        if (updateError) {
          setError(`Impossible de changer le statut de certaines missions : ${updateError.message}`);
        } else {
          updatedCount += data?.length ?? 0;
        }
      }

      await loadData();
      return { updatedCount, failedCount: missionIds.length - updatedCount };
    },
    [missions, loadData]
  );

  const bulkDeleteMissions = useCallback(
    async (missionIds: string[]): Promise<{ deletedCount: number }> => {
      if (missionIds.length === 0) return { deletedCount: 0 };

      setError(null);

      const { data, error: deleteError } = await supabase.from('missions').delete().in('id', missionIds).select('id');

      if (deleteError) {
        setError(`Impossible de supprimer les missions sélectionnées : ${deleteError.message}`);
        await loadData();
        return { deletedCount: 0 };
      }

      await loadData();
      return { deletedCount: data?.length ?? 0 };
    },
    [loadData]
  );

  const proposalByMission = useMemo(() => new Map(proposals.map((proposal) => [proposal.mission_id, proposal])), [proposals]);

  const relationByMission = useMemo(() => {
    const map = new Map<string, MissionRelation>();
    missions.forEach((mission) => {
      map.set(mission.id, relationForProposal(proposalByMission.get(mission.id), retainedMissionIds.has(mission.id)));
    });
    return map;
  }, [missions, proposalByMission, retainedMissionIds]);

  const missionTypeById = useMemo(() => new Map(missionTypes.map((t) => [t.id, t])), [missionTypes]);

  const typeColorById = useMemo(
    () => new Map(missionTypes.map((t) => [t.id, resolveMissionTypeColor(t.name, t.color)])),
    [missionTypes]
  );

  const missionCountsByTypeId = useMemo(
    () =>
      missions.reduce<Record<string, number>>((counts, mission) => {
        counts[mission.mission_type_id] = (counts[mission.mission_type_id] ?? 0) + 1;
        return counts;
      }, {}),
    [missions]
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

  return {
    profile,
    missions,
    missionTypes,
    proposals,
    retainedMissionIds,
    canManageMissionTypeIds,
    proposalStatsByMission,
    proposalByMission,
    relationByMission,
    missionTypeById,
    typeColorById,
    missionCountsByStatus,
    missionCountsByTypeId,
    loading,
    error,
    reload: loadData,
    publishDraftMission,
    bulkUpdateMissionStatus,
    bulkDeleteMissions
  };
}
