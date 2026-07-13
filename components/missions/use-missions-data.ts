'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Mission, MissionProposal, MissionRequiredMateriel, MissionRequiredSkill, MissionStatus, Profile, RoleBehavior } from '@/lib/types';
import { groupMissionsByMonth, MissionRelation, relationForProposal, resolveMissionTypeColor } from '@/lib/mission-timeline';

export type MissionType = { id: string; name: string; color?: string | null };

export type MissionWithRequiredSkills = Mission & {
  mission_required_skills: MissionRequiredSkill[] | null;
  mission_required_materiels: MissionRequiredMateriel[] | null;
};

export type VolunteerWithSkills = { name: string; avatarUrl: string | null; skills: Array<{ name: string; color?: string | null }> };

export type RetainedVolunteer = { name: string; avatarUrl: string | null };

const RETAINED_ASSIGNMENT_STATUSES = ['selected', 'confirmed'];

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
  const [retainedVolunteersByMission, setRetainedVolunteersByMission] = useState<Map<string, RetainedVolunteer[]>>(new Map());
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
          'id,title,description,location,mission_type_id,starts_at,ends_at,required_volunteers,status,created_by,created_at,mission_required_skills(id,mission_id,skill_id,quantity,created_at,skill:skills(id,name,category_id,display_order)),mission_required_materiels(id,mission_id,category_id,quantity,created_at,category:materiel_categories(id,name,color))'
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
      })),
      mission_required_materiels: (mission.mission_required_materiels ?? []).map((requiredMateriel) => ({
        ...requiredMateriel,
        category: Array.isArray(requiredMateriel.category) ? requiredMateriel.category[0] ?? null : requiredMateriel.category
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
    const [proposalsRes, rolesRes, retainedAssignmentsRes] = await Promise.all([
      supabase
        .from('mission_proposals')
        .select('id,mission_id,volunteer_id,proposed_by,response,status,decided_at,decided_by,updated_by_admin,updated_by,updated_at,source,created_at')
        .in('mission_id', mappedMissions.map((mission) => mission.id)),
      fetch('/api/roles/mine', { headers: authHeaders }),
      supabase
        .from('mission_assignments')
        .select('mission_id,assignment_status,volunteer:profiles!mission_assignments_volunteer_id_fkey(id,full_name,avatar_url)')
        .in('mission_id', mappedMissions.map((mission) => mission.id))
        .in('assignment_status', RETAINED_ASSIGNMENT_STATUSES)
    ]);

    const nextRetainedVolunteersByMission = new Map<string, RetainedVolunteer[]>();
    if (!retainedAssignmentsRes.error) {
      (retainedAssignmentsRes.data ?? []).forEach((row) => {
        const volunteer = Array.isArray(row.volunteer) ? row.volunteer[0] : row.volunteer;
        const list = nextRetainedVolunteersByMission.get(row.mission_id) ?? [];
        list.push({ name: volunteer?.full_name?.trim() || 'Sans nom', avatarUrl: volunteer?.avatar_url ?? null });
        nextRetainedVolunteersByMission.set(row.mission_id, list);
      });
    }
    setRetainedVolunteersByMission(nextRetainedVolunteersByMission);

    if (rolesRes.ok) {
      const rolesJson = (await rolesRes.json()) as { behaviors: RoleBehavior[]; isAdmin?: boolean };
      const isAdmin = Boolean(rolesJson.isAdmin);

      const canManageBehaviors = rolesJson.behaviors.filter((b) => b.resource_type === 'mission' && b.behavior_type === 'can_manage');
      const manageIds = canManageBehaviors.some((b) => (b.mission_type_ids ?? []).length === 0)
        ? allTypeIds
        : Array.from(new Set(canManageBehaviors.flatMap((b) => b.mission_type_ids ?? [])));

      // L'admin (rôle système) n'a pas de lignes role_behaviors : on force donc
      // tous les types pour garder les actions de gestion disponibles.
      setCanManageMissionTypeIds(isAdmin ? allTypeIds : manageIds);
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
        .select('id,full_name,avatar_url,profile_skills(skill:skills(name,skill_categories(color)))')
        .in('id', availableVolunteerIds)
      : { data: [] };

    const volunteersById = new Map(
      (availableProfiles ?? []).map((profile) => [
        profile.id,
        {
          name: profile.full_name?.trim() || 'Sans nom',
          avatarUrl: profile.avatar_url ?? null,
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
        current.availableVolunteers.push(volunteersById.get(proposal.volunteer_id) ?? { name: 'Sans nom', avatarUrl: null, skills: [] });
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

      const { data, error: updateError } = await supabase
        .from('missions')
        .update({ status: 'proposed' })
        .eq('id', missionId)
        .eq('status', 'draft')
        .select('id');

      if (updateError) {
        setError(`Impossible de passer la mission en proposé : ${updateError.message}`);
        return;
      }
      // La RLS qui refuse la mise à jour ne renvoie pas d'erreur : elle exclut
      // silencieusement la ligne. Sans ce contrôle, le clic paraît sans effet.
      if (!data || data.length === 0) {
        setError("Cette mission n'a pas pu être publiée (droits insuffisants ou statut modifié entre-temps).");
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
      let errorMessage: string | null = null;

      if (targetStatus === 'confirmed' || targetStatus === 'cancelled') {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token ?? '';
        const endpoint = targetStatus === 'confirmed' ? 'confirm' : 'cancel';

        const results = await Promise.all(
          missionIds.map(async (missionId) => {
            const currentStatus = missionById.get(missionId)?.status;
            const eligible =
              targetStatus === 'confirmed' ? currentStatus === 'proposed' : currentStatus !== 'confirmed' && currentStatus !== 'cancelled';
            if (!eligible) return false;

            const response = await fetch(`/api/admin/missions/${missionId}/${endpoint}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` }
            });
            return response.ok;
          })
        );

        const routeUpdatedCount = results.filter(Boolean).length;
        updatedCount += routeUpdatedCount;

        // Ineligibilité (statut de départ incompatible) ou échec d'appel API :
        // dans les deux cas, sans ce message le clic semble n'avoir aucun effet.
        if (routeUpdatedCount < missionIds.length) {
          errorMessage =
            targetStatus === 'confirmed'
              ? `${missionIds.length - routeUpdatedCount} mission(s) n'ont pas pu être confirmée(s) (seule une mission "Proposée" peut être confirmée).`
              : `${missionIds.length - routeUpdatedCount} mission(s) n'ont pas pu être annulée(s) (une mission déjà confirmée ne peut pas être annulée).`;
        }
      } else {
        rawUpdateIds.push(...missionIds.filter((missionId) => missionById.get(missionId)?.status !== targetStatus));
        updatedCount += missionIds.length - rawUpdateIds.length;
      }

      if (rawUpdateIds.length > 0) {
        const { data, error: updateError } = await supabase.from('missions').update({ status: targetStatus }).in('id', rawUpdateIds).select('id');

        if (updateError) {
          errorMessage = `Impossible de changer le statut de certaines missions : ${updateError.message}`;
        } else {
          const rawUpdatedCount = data?.length ?? 0;
          updatedCount += rawUpdatedCount;
          // Une policy RLS qui refuse la mise à jour ne renvoie pas d'erreur :
          // elle exclut silencieusement les lignes concernées du résultat.
          if (rawUpdatedCount < rawUpdateIds.length) {
            errorMessage = "Certaines missions n'ont pas pu être mises à jour (droits insuffisants ou statut modifié entre-temps).";
          }
        }
      }

      // loadData() remet l'erreur à zéro en tête de fonction : on ne peut donc
      // afficher le message qu'après l'avoir attendue, sinon il est effacé
      // avant même d'être rendu.
      await loadData();
      if (errorMessage) setError(errorMessage);

      return { updatedCount, failedCount: missionIds.length - updatedCount };
    },
    [missions, loadData]
  );

  const bulkDeleteMissions = useCallback(
    async (missionIds: string[]): Promise<{ deletedCount: number }> => {
      if (missionIds.length === 0) return { deletedCount: 0 };

      setError(null);

      const { data, error: deleteError } = await supabase.from('missions').delete().in('id', missionIds).select('id');

      let errorMessage: string | null = null;
      let deletedCount = 0;

      if (deleteError) {
        errorMessage = `Impossible de supprimer les missions sélectionnées : ${deleteError.message}`;
      } else {
        deletedCount = data?.length ?? 0;
        // Comme pour AdminDeleteMissionButton : une policy RLS qui refuse la
        // suppression ne renvoie pas d'erreur, elle renvoie simplement 0 ligne.
        if (deletedCount < missionIds.length) {
          errorMessage =
            deletedCount === 0
              ? "Aucune mission n'a pu être supprimée. Vérifiez vos droits d'accès puis actualisez la page."
              : `${missionIds.length - deletedCount} mission(s) n'ont pas pu être supprimée(s) (droits insuffisants ou déjà supprimées).`;
        }
      }

      await loadData();
      if (errorMessage) setError(errorMessage);

      return { deletedCount };
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
    retainedVolunteersByMission,
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
