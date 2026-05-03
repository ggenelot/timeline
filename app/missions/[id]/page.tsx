'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { MissionStatusBadge } from '@/components/missions/mission-status-badge';
import { ProposalButton } from '@/components/missions/proposal-button';
import { StatusBadge } from '@/components/missions/status-badge';
import { supabase } from '@/lib/supabase/client';
import {
  ActivityLog,
  MISSION_CATEGORY_LABELS,
  Mission,
  MissionAssignment,
  MissionProposal,
  MissionProposalResponse,
  MissionRequiredSkill,
  Profile,
  ProfileSkill
} from '@/lib/types';
import { formatMissionRequirementLabel, getProposalResponseLabel } from '@/lib/missions';
import { buildExpandedSkillSet, compareSkillCodes, getSkillLabel, SkillCode } from '@/lib/skills';

type ProposalWithVolunteer = MissionProposal & {
  volunteer: (Pick<Profile, 'id' | 'full_name' | 'email'> & {
    profile_skills?: ProfileSkill[] | null;
  }) | null;
};

type VolunteerOption = Pick<Profile, 'id' | 'full_name' | 'email'>;

type AssignmentWithVolunteer = MissionAssignment & {
  volunteer: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
};

type MissionWithSkills = Mission & {
  mission_required_skills: MissionRequiredSkill[] | null;
};

type ActivityLogWithActor = ActivityLog & {
  actor: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
};

const ACTIVITY_TYPE_LABELS: Record<ActivityLog['action_type'], string> = {
  mission_created: 'Création',
  mission_status_changed: 'Statut',
  proposal_response_updated: 'Réponse',
  volunteer_selected: 'Retenu',
  volunteer_removed: 'Retiré'
};

const ACTIVITY_TYPE_TINTS: Record<ActivityLog['action_type'], string> = {
  mission_created: 'border-emerald-200 bg-emerald-50/50',
  mission_status_changed: 'border-blue-200 bg-blue-50/50',
  proposal_response_updated: 'border-amber-200 bg-amber-50/50',
  volunteer_selected: 'border-violet-200 bg-violet-50/50',
  volunteer_removed: 'border-rose-200 bg-rose-50/50'
};

const adminResponseOptions: Array<{ label: string; value: Exclude<MissionProposalResponse, 'no_response'> }> = [
  { label: 'Disponible', value: 'available' },
  { label: 'Indisponible', value: 'unavailable' }
];

function getDefaultSlackChannelName(title: string, startsAt: string) {
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  const date = new Date(startsAt).toISOString().slice(0, 10);
  return `mission-${slug || 'sans-titre'}-${date}`.slice(0, 80);
}

function formatElapsedSince(dateIso: string | null): string {
  if (!dateIso) return 'Aucune activité';
  const elapsedMs = Date.now() - new Date(dateIso).getTime();
  if (elapsedMs < 0) return 'À venir';
  const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days}j`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return `Il y a ${weeks} sem.`;
  const months = Math.floor(days / 30);
  return `Il y a ${months} mois`;
}

export default function MissionDetailPage() {
  const params = useParams<{ id: string }>();
  const missionId = params.id;
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mission, setMission] = useState<MissionWithSkills | null>(null);
  const [proposals, setProposals] = useState<ProposalWithVolunteer[]>([]);
  const [assignments, setAssignments] = useState<AssignmentWithVolunteer[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogWithActor[]>([]);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [isSkillsDirectoryExpanded, setIsSkillsDirectoryExpanded] = useState(true);
  const [isAvailabilityExpanded, setIsAvailabilityExpanded] = useState(false);
  const [isSlackCardExpanded, setIsSlackCardExpanded] = useState(false);
  const [slackChannelNameDraft, setSlackChannelNameDraft] = useState('');
  const [slackMessageDraft, setSlackMessageDraft] = useState('');
  const [slackFreeMessageDraft, setSlackFreeMessageDraft] = useState('');
  const [activitySearch, setActivitySearch] = useState('');
  const [selectedActivityType, setSelectedActivityType] = useState<'all' | ActivityLog['action_type']>('all');
  const [allVolunteers, setAllVolunteers] = useState<VolunteerOption[]>([]);
  const [selectedVolunteerSkillCode, setSelectedVolunteerSkillCode] = useState<'all' | SkillCode>('all');
  const [selectedVolunteerIdToAdd, setSelectedVolunteerIdToAdd] = useState('');
  const [selectedResponseToAdd, setSelectedResponseToAdd] = useState<Exclude<MissionProposalResponse, 'no_response'>>('available');
  const [showAvailabilityManagement, setShowAvailabilityManagement] = useState(false);
  const [pendingAssignments, setPendingAssignments] = useState<Map<string, string | null>>(new Map());
  const [supportsMissionRequiredSkillReference, setSupportsMissionRequiredSkillReference] = useState(true);
  const [volunteerActivityStats, setVolunteerActivityStats] = useState<Record<string, { lastActivityAt: string | null; monthlyCount: number }>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [slackCreationState, setSlackCreationState] = useState<'idle' | 'creating' | 'created'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const myProposal = useMemo(() => proposals.find((proposal) => proposal.volunteer_id === profile?.id) ?? null, [profile?.id, proposals]);

  const eligibleProposals = useMemo(() => proposals.filter((proposal) => proposal.response === 'available'), [proposals]);

  const volunteerSkillOptions = useMemo(() => {
    const usedCodes = new Set<SkillCode>();

    eligibleProposals.forEach((proposal) => {
      const explicitSkillNames = (proposal.volunteer?.profile_skills ?? [])
        .map((profileSkill) => profileSkill.skill?.name)
        .filter((skillName): skillName is string => Boolean(skillName));

      buildExpandedSkillSet(explicitSkillNames).forEach((skillCode) => usedCodes.add(skillCode));
    });

    return Array.from(usedCodes)
      .sort(compareSkillCodes)
      .map((skillCode) => ({ code: skillCode, name: getSkillLabel(skillCode) }));
  }, [eligibleProposals]);

  const filteredEligibleProposals = useMemo(() => {
    if (selectedVolunteerSkillCode === 'all') {
      return eligibleProposals;
    }

    return eligibleProposals.filter((proposal) => {
      const explicitSkillNames = (proposal.volunteer?.profile_skills ?? [])
        .map((profileSkill) => profileSkill.skill?.name)
        .filter((skillName): skillName is string => Boolean(skillName));

      return buildExpandedSkillSet(explicitSkillNames).has(selectedVolunteerSkillCode);
    });
  }, [eligibleProposals, selectedVolunteerSkillCode]);

  const isAdmin = profile?.role === 'admin';

  const proposalsByStatus = useMemo(() => {
    const available = proposals.filter((proposal) => proposal.response === 'available').length;
    const unavailable = proposals.filter((proposal) => proposal.response === 'unavailable').length;
    const explicitNoResponse = proposals.filter((proposal) => proposal.response === 'no_response').length;
    const volunteersWithoutProposal = Math.max(allVolunteers.length - proposals.length, 0);

    return {
      available,
      unavailable,
      no_response: explicitNoResponse + volunteersWithoutProposal
    };
  }, [allVolunteers.length, proposals]);

  const requiredSkillCodes = useMemo(() => {
    const skillNames = (mission?.mission_required_skills ?? [])
      .map((requiredSkill) => requiredSkill.skill?.name)
      .filter((skillName): skillName is string => Boolean(skillName));

    return buildExpandedSkillSet(skillNames);
  }, [mission?.mission_required_skills]);

  const proposalsTableRows = useMemo(
    () =>
      proposals.map((proposal) => ({
        id: proposal.id,
        volunteerId: proposal.volunteer_id,
        volunteerLabel: proposal.volunteer?.full_name ?? proposal.volunteer?.email ?? proposal.volunteer_id,
        matchingRequiredSkills: Array.from(
          buildExpandedSkillSet(
            (proposal.volunteer?.profile_skills ?? [])
              .map((profileSkill) => profileSkill.skill?.name)
              .filter((skillName): skillName is string => Boolean(skillName))
          )
        )
          .filter((skillCode) => requiredSkillCodes.has(skillCode))
          .sort(compareSkillCodes)
          .map((skillCode) => getSkillLabel(skillCode)),
        response: proposal.response,
        responseLabel: getProposalResponseLabel(proposal.response),
        responseTone:
          proposal.response === 'available'
            ? 'text-emerald-700'
            : proposal.response === 'unavailable'
              ? 'text-rose-700'
              : 'text-slate-600',
        responseRowBackground:
          proposal.response === 'available'
            ? 'bg-emerald-50/50'
            : proposal.response === 'unavailable'
              ? 'bg-rose-50/50'
              : 'bg-slate-100/60',
        updatedByAdminLabel: proposal.updated_by_admin ? 'Oui' : 'Non'
      })),
    [proposals, requiredSkillCodes]
  );

  const availableVolunteersToAdd = useMemo(() => {
    const linkedVolunteerIds = new Set(proposals.map((proposal) => proposal.volunteer_id));
    return allVolunteers.filter((volunteer) => !linkedVolunteerIds.has(volunteer.id));
  }, [allVolunteers, proposals]);

  useEffect(() => {
    setPendingAssignments(new Map(assignments.map((assignment) => [assignment.volunteer_id, assignment.mission_required_skill_id])));
  }, [assignments]);



  const requiredSkillsVolunteerDirectory = useMemo(() => {
    const requiredSkills = (mission?.mission_required_skills ?? [])
      .map((requiredSkill) => ({
        id: requiredSkill.id,
        name: requiredSkill.skill?.name ?? null
      }))
      .filter((requiredSkill): requiredSkill is { id: string; name: string } => Boolean(requiredSkill.name));

    return requiredSkills.map((requiredSkill) => {
      const requiredSkillCode = buildExpandedSkillSet([requiredSkill.name]);

      const volunteers = proposals
        .map((proposal) => {
          const explicitSkillNames = (proposal.volunteer?.profile_skills ?? [])
            .map((profileSkill) => profileSkill.skill?.name)
            .filter((skillName): skillName is string => Boolean(skillName));

          const volunteerSkillCodes = buildExpandedSkillSet(explicitSkillNames);
          const matchesRequiredSkill = Array.from(requiredSkillCode).some((skillCode) => volunteerSkillCodes.has(skillCode));

          if (!matchesRequiredSkill || !proposal.volunteer) {
            return null;
          }

          return {
            id: proposal.volunteer.id,
            fullName: proposal.volunteer.full_name ?? proposal.volunteer.email ?? 'Bénévole',
            initials: (proposal.volunteer.full_name ?? proposal.volunteer.email ?? 'B')
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase() ?? '')
              .join('')
          };
        })
        .filter((volunteer): volunteer is { id: string; fullName: string; initials: string } => Boolean(volunteer));

      const uniqueVolunteers = volunteers.filter((volunteer, index, list) => list.findIndex((entry) => entry.id === volunteer.id) === index);

      return {
        requiredSkillId: requiredSkill.id,
        requiredSkillName: requiredSkill.name,
        requiredCount:
          mission?.mission_required_skills?.find((missionRequiredSkill) => missionRequiredSkill.id === requiredSkill.id)?.quantity ?? 0,
        volunteers: uniqueVolunteers
      };
    });
  }, [mission?.mission_required_skills, proposals]);

  const requiredSkillNameById = useMemo(() => {
    return new Map(
      (mission?.mission_required_skills ?? []).map((requiredSkill) => [requiredSkill.id, requiredSkill.skill?.name ?? 'Sans compétence particulière'])
    );
  }, [mission?.mission_required_skills]);

  const areSkillConstraintsMet = useMemo(
    () =>
      requiredSkillsVolunteerDirectory.every(
        (skillGroup) =>
          skillGroup.volunteers.filter((volunteer) => pendingAssignments.get(volunteer.id) === skillGroup.requiredSkillId).length >= skillGroup.requiredCount
      ),
    [pendingAssignments, requiredSkillsVolunteerDirectory]
  );

  const activityTypeCounts = useMemo(() => {
    const counts: Record<ActivityLog['action_type'], number> = {
      mission_created: 0,
      mission_status_changed: 0,
      proposal_response_updated: 0,
      volunteer_selected: 0,
      volunteer_removed: 0
    };

    activityLogs.forEach((log) => {
      counts[log.action_type] += 1;
    });

    return counts;
  }, [activityLogs]);

  const filteredActivityLogs = useMemo(() => {
    const normalizedSearch = activitySearch.trim().toLocaleLowerCase('fr-FR');
    return activityLogs.filter((log) => {
      if (selectedActivityType !== 'all' && log.action_type !== selectedActivityType) {
        return false;
      }

      if (normalizedSearch.length === 0) {
        return true;
      }

      const actorLabel = (log.actor?.full_name ?? log.actor?.email ?? 'système').toLocaleLowerCase('fr-FR');
      const haystack = `${log.description} ${ACTIVITY_TYPE_LABELS[log.action_type]} ${actorLabel}`.toLocaleLowerCase('fr-FR');
      return haystack.includes(normalizedSearch);
    });
  }, [activityLogs, activitySearch, selectedActivityType]);

  async function getAccessToken() {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token ?? '';
  }

  async function loadAdminVolunteerDirectory(id: string) {
    const token = await getAccessToken();
    if (!token) {
      return;
    }

    const response = await fetch(`/api/admin/missions/${id}/volunteers`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { volunteers: Array<VolunteerOption & { role: string }> };
    setAllVolunteers((payload.volunteers ?? []).map(({ id: volunteerId, full_name, email }) => ({ id: volunteerId, full_name, email })));
  }

  async function loadData() {
    setLoading(true);
    setError(null);

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      router.replace('/login');
      return;
    }

    setUser(authData.user);

    const { data: profileData } = await supabase
      .from('profiles')
      .select('id,full_name,email,phone,role,sector,created_at,slack_user_id,slack_team_id,slack_connected_at')
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
        'id,title,description,location,sector,category,starts_at,ends_at,required_volunteers,status,created_by,created_at,slack_channel_id,slack_channel_name,slack_channel_created_at,mission_required_skills(id,mission_id,skill_id,quantity,created_at,skill:skills(id,name))'
      )
      .eq('id', missionId)
      .single();

    if (missionError || !missionData) {
      setError('Mission introuvable ou accès refusé.');
      setLoading(false);
      return;
    }

    const mappedMission: MissionWithSkills = {
      ...missionData,
      mission_required_skills: (missionData.mission_required_skills ?? []).map((requiredSkill) => ({
        ...requiredSkill,
        skill: Array.isArray(requiredSkill.skill) ? requiredSkill.skill[0] ?? null : requiredSkill.skill
      }))
    };

    setMission(mappedMission);

    const { data: proposalData, error: proposalsError } = await supabase
      .from('mission_proposals')
      .select(
        'id,mission_id,volunteer_id,proposed_by,response,status,decided_at,decided_by,updated_by_admin,updated_by,updated_at,source,created_at,volunteer:profiles!mission_proposals_volunteer_id_fkey(id,full_name,email,profile_skills(profile_id,skill_id,created_at,skill:skills(id,name)))'
      )
      .eq('mission_id', missionId)
      .order('created_at', { ascending: true });

    if (proposalsError) {
      setError(proposalsError.message);
      setLoading(false);
      return;
    }

    let assignmentData: Array<MissionAssignment & { volunteer: Pick<Profile, 'id' | 'full_name' | 'email'>[] | Pick<Profile, 'id' | 'full_name' | 'email'> | null }> | null = null;
    let assignmentsError: { message: string } | null = null;
    let assignmentQuerySupportsSkillReference = true;

    const assignmentsWithRequiredSkill = await supabase
      .from('mission_assignments')
      .select('id,mission_id,volunteer_id,mission_required_skill_id,assignment_status,created_at,volunteer:profiles!mission_assignments_volunteer_id_fkey(id,full_name,email)')
      .eq('mission_id', missionId)
      .order('created_at', { ascending: true });

    if (assignmentsWithRequiredSkill.error?.message.includes('mission_assignments.mission_required_skill_id')) {
      assignmentQuerySupportsSkillReference = false;
      const assignmentsWithoutRequiredSkill = await supabase
        .from('mission_assignments')
        .select('id,mission_id,volunteer_id,assignment_status,created_at,volunteer:profiles!mission_assignments_volunteer_id_fkey(id,full_name,email)')
        .eq('mission_id', missionId)
        .order('created_at', { ascending: true });

      assignmentData = (assignmentsWithoutRequiredSkill.data ?? []).map((assignment) => ({
        ...assignment,
        mission_required_skill_id: null
      }));
      assignmentsError = assignmentsWithoutRequiredSkill.error;
    } else {
      assignmentData = assignmentsWithRequiredSkill.data as typeof assignmentData;
      assignmentsError = assignmentsWithRequiredSkill.error;
    }

    setSupportsMissionRequiredSkillReference(assignmentQuerySupportsSkillReference);

    if (assignmentsError) {
      setError(assignmentsError.message);
      setLoading(false);
      return;
    }

    const { data: logData, error: logsError } = await supabase
      .from('activity_logs')
      .select('id,mission_id,actor_id,action_type,entity_type,entity_id,description,created_at,actor:profiles!activity_logs_actor_id_fkey(id,full_name,email)')
      .eq('mission_id', missionId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (logsError) {
      setError(logsError.message);
      setLoading(false);
      return;
    }

    const mappedProposals: ProposalWithVolunteer[] = (proposalData ?? []).map((proposal) => {
      const volunteer = Array.isArray(proposal.volunteer) ? proposal.volunteer[0] ?? null : proposal.volunteer;

      return {
        ...proposal,
        volunteer: volunteer
          ? {
              ...volunteer,
              profile_skills: (volunteer.profile_skills ?? []).map((profileSkill) => ({
                ...profileSkill,
                skill: Array.isArray(profileSkill.skill) ? profileSkill.skill[0] ?? null : profileSkill.skill
              }))
            }
          : null
      };
    });

    const mappedAssignments: AssignmentWithVolunteer[] = (assignmentData ?? []).map((assignment) => ({
      ...assignment,
      volunteer: Array.isArray(assignment.volunteer) ? assignment.volunteer[0] ?? null : assignment.volunteer
    }));

    const mappedLogs: ActivityLogWithActor[] = (logData ?? []).map((log) => ({
      ...log,
      actor: Array.isArray(log.actor) ? log.actor[0] ?? null : log.actor
    }));

    setProposals(mappedProposals);
    setAssignments(mappedAssignments);
    setActivityLogs(mappedLogs);

    const since = new Date();
    since.setMonth(since.getMonth() - 1);
    const assignmentRows = await Promise.all(
      mappedProposals
        .map((proposal) => proposal.volunteer_id)
        .filter((value, index, list) => list.indexOf(value) === index)
        .map(async (volunteerId) => {
          const { data } = await supabase
            .from('mission_assignments')
            .select('created_at')
            .eq('volunteer_id', volunteerId)
            .order('created_at', { ascending: false })
            .limit(100);

          const lastActivityAt = data?.[0]?.created_at ?? null;
          const monthlyCount = (data ?? []).filter((entry) => new Date(entry.created_at) >= since).length;
          return [volunteerId, { lastActivityAt, monthlyCount }] as const;
        })
    );
    setVolunteerActivityStats(Object.fromEntries(assignmentRows));

    if (profileData.role === 'admin') {
      await loadAdminVolunteerDirectory(missionId);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId, router]);

  useEffect(() => {
    if (!mission) return;
    const defaultName = mission.slack_channel_name || getDefaultSlackChannelName(mission.title, mission.starts_at);
    const defaultMessage = `Bienvenue dans le canal de mission *${mission.title}*.\n📅 ${new Date(mission.starts_at).toLocaleString('fr-FR')} - ${new Date(
      mission.ends_at
    ).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}${mission.location ? `\n📍 ${mission.location}` : ''}\nConsultez Timeline pour les détails et mises à jour.`;
    setSlackChannelNameDraft(defaultName);
    setSlackMessageDraft(defaultMessage);
  }, [mission]);

  if (loading) {
    return <p className="text-sm text-slate-600">Chargement du détail mission...</p>;
  }

  if (!mission) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">{error ?? 'Mission introuvable.'}</p>
        <Link href="/missions" className="text-sm text-slate-700 underline">
          Retour à la liste
        </Link>
      </div>
    );
  }

  const canManageMission = profile?.role === 'admin' || (profile?.role === 'responsable' && mission.created_by === user?.id);
  const missionBlocksSelection = mission.status === 'cancelled' || mission.status === 'confirmed';
  const isSlackChannelCreated = Boolean(mission.slack_channel_id) || slackCreationState === 'created';

  async function setVolunteerResponseByAdmin(volunteerId: string, response: Exclude<MissionProposalResponse, 'no_response'>) {
    if (!isAdmin || !mission) {
      setError('Accès refusé : seuls les administrateurs peuvent modifier ce statut.');
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setError('Session invalide. Reconnectez-vous puis réessayez.');
      return;
    }

    setActionLoading(`admin-response-${volunteerId}`);
    setError(null);
    setSuccess(null);

    const request = await fetch(`/api/admin/missions/${mission.id}/volunteers`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        volunteer_id: volunteerId,
        response
      })
    });

    const payload = (await request.json()) as { error?: string; message?: string };

    if (!request.ok) {
      setError(payload.error ?? 'Impossible de modifier le statut bénévole.');
      setActionLoading(null);
      return;
    }

    setSuccess(payload.message ?? 'Statut bénévole mis à jour.');
    setActionLoading(null);
    await loadData();
  }

  async function addVolunteerWithStatus() {
    if (!selectedVolunteerIdToAdd) {
      setError('Veuillez sélectionner un bénévole à ajouter.');
      return;
    }

    await setVolunteerResponseByAdmin(selectedVolunteerIdToAdd, selectedResponseToAdd);
    setSelectedVolunteerIdToAdd('');
  }

  async function toggleSelection(volunteerId: string, requiredSkillId?: string) {
    if (!mission || missionBlocksSelection) {
      return;
    }

    setPendingAssignments((current) => {
      const next = new Map(current);
      if (next.has(volunteerId)) {
        next.delete(volunteerId);
      } else {
        next.set(volunteerId, requiredSkillId ?? null);
      }
      return next;
    });
  }

  async function saveCrewSelection() {
    if (!mission || missionBlocksSelection) {
      return;
    }

    setActionLoading('save-selection');
    setError(null);
    setSuccess(null);

    const currentlySelectedIds = new Set(assignments.map((assignment) => assignment.volunteer_id));
    const pendingSelectedIds = new Set(Array.from(pendingAssignments.keys()));
    const toInsert = Array.from(pendingSelectedIds).filter((volunteerId) => !currentlySelectedIds.has(volunteerId));
    const toDelete = Array.from(currentlySelectedIds).filter((volunteerId) => !pendingSelectedIds.has(volunteerId));
    const toUpdate = supportsMissionRequiredSkillReference
      ? assignments.filter((assignment) => pendingAssignments.get(assignment.volunteer_id) !== assignment.mission_required_skill_id)
      : [];

    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase.from('mission_assignments').delete().eq('mission_id', mission.id).in('volunteer_id', toDelete);
      if (deleteError) {
        setError(`Impossible de mettre à jour la sélection : ${deleteError.message}`);
        setActionLoading(null);
        return;
      }
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from('mission_assignments').insert(
        toInsert.map((volunteerId) => ({
          mission_id: mission.id,
          volunteer_id: volunteerId,
          ...(supportsMissionRequiredSkillReference ? { mission_required_skill_id: pendingAssignments.get(volunteerId) ?? null } : {}),
          assignment_status: 'selected'
        }))
      );
      if (insertError) {
        setError(`Impossible de mettre à jour la sélection : ${insertError.message}`);
        setActionLoading(null);
        return;
      }
    }
    for (const assignment of toUpdate) {
      const { error: updateError } = await supabase
        .from('mission_assignments')
        .update({ mission_required_skill_id: pendingAssignments.get(assignment.volunteer_id) ?? null })
        .eq('id', assignment.id);
      if (updateError) {
        setError(`Impossible de mettre à jour la sélection : ${updateError.message}`);
        setActionLoading(null);
        return;
      }
    }

    setActionLoading(null);
    setSuccess('Sélection de l’équipage mise à jour.');
    await loadData();
  }

  async function syncSlackChannel() {
    if (!mission) {
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setError('Session invalide. Reconnectez-vous puis réessayez.');
      return;
    }

    setActionLoading('sync-slack-channel');
    setSlackCreationState('creating');
    setError(null);
    setSuccess(null);

    const response = await fetch(`/api/admin/missions/${mission.id}/slack-sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channelName: slackChannelNameDraft,
        welcomeMessage: slackMessageDraft
      })
    });

    const payload = (await response.json()) as { error?: string; message?: string };

    if (!response.ok) {
      setError(payload.error ?? 'Synchronisation Slack impossible.');
      setActionLoading(null);
      setSlackCreationState('idle');
      return;
    }

    setSuccess(payload.message ?? 'Synchronisation Slack terminée.');
    setActionLoading(null);
    setSlackCreationState('created');
    await loadData();
  }


  async function sendSlackFreeMessage() {
    if (!mission || !mission.slack_channel_id) {
      setError('Le canal Slack doit être créé avant l’envoi d’un message libre.');
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setError('Session invalide. Reconnectez-vous puis réessayez.');
      return;
    }

    if (!slackFreeMessageDraft.trim()) {
      setError('Veuillez saisir un message à envoyer.');
      return;
    }

    setActionLoading('send-slack-message');
    setError(null);
    setSuccess(null);

    const response = await fetch(`/api/admin/missions/${mission.id}/slack-message`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: slackFreeMessageDraft
      })
    });

    const payload = (await response.json()) as { error?: string; message?: string };

    if (!response.ok) {
      setError(payload.error ?? 'Envoi du message Slack impossible.');
      setActionLoading(null);
      return;
    }

    setSuccess(payload.message ?? 'Message envoyé sur Slack.');
    setSlackFreeMessageDraft('');
    setActionLoading(null);
  }

  async function confirmCrewSelection() {
    if (!mission || missionBlocksSelection) return;
    if (!areSkillConstraintsMet) {
      setError('Les contraintes de compétences ne sont pas encore atteintes.');
      return;
    }
    await saveCrewSelection();
    const token = await getAccessToken();
    if (!token) return;
    setActionLoading('confirm-selection');
    const response = await fetch(`/api/admin/missions/${mission.id}/confirm`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const payload = (await response.json()) as { error?: string; message?: string };
    if (!response.ok) {
      setError(payload.error ?? 'Confirmation impossible.');
      setActionLoading(null);
      return;
    }
    setSuccess(payload.message ?? 'Mission confirmée.');
    setIsSkillsDirectoryExpanded(false);
    setIsSlackCardExpanded(true);
    setActionLoading(null);
    await loadData();
  }

  return (
    <div className="space-y-6">
      <Link href="/missions" className="text-sm text-slate-700 underline">
        ← Retour aux missions
      </Link>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}

      <article className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/70 shadow-sm">
        <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">{mission.title}</h1>
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <Link
                href={`/admin/missions/${mission.id}/edit`}
                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
              >
                Modifier
              </Link>
            ) : null}
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">{MISSION_CATEGORY_LABELS[mission.category]}</span>
            <MissionStatusBadge status={mission.status} />
          </div>
        </div>
        <p className="mt-2 text-sm text-slate-700">{mission.description ?? 'Aucune description'}</p>
        <dl className="mt-3 grid gap-1 text-sm text-slate-600 md:grid-cols-2">
          <div>
            <dt className="inline font-medium text-slate-700">Lieu :</dt> {mission.location ?? 'Non défini'}
          </div>
          <div>
            <dt className="inline font-medium text-slate-700">Secteur :</dt> {mission.sector ?? 'Non défini'}
          </div>
          <div>
            <dt className="inline font-medium text-slate-700">Début :</dt> {new Date(mission.starts_at).toLocaleString('fr-FR')}
          </div>
          <div>
            <dt className="inline font-medium text-slate-700">Fin :</dt> {new Date(mission.ends_at).toLocaleString('fr-FR')}
          </div>
        </dl>

        {(mission.mission_required_skills ?? []).length > 0 ? (
          <div className="mt-3 text-sm text-slate-700">
            <p className="font-medium">Compétences requises :</p>
            <ul className="mt-2 flex flex-wrap gap-1">
              {(mission.mission_required_skills ?? []).map((requiredSkill) => (
                <li key={requiredSkill.id} className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700">
                  {formatMissionRequirementLabel(requiredSkill.skill?.name, requiredSkill.quantity)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {profile?.role === 'benevole' ? (
          <div className="mt-4 flex flex-col items-start gap-3">
            <ProposalButton missionId={mission.id} volunteerId={profile.id} disabled={false} missionStatus={mission.status} currentResponse={myProposal?.response ?? null} />
            {myProposal ? <StatusBadge status={myProposal.status} /> : null}
            {!myProposal ? <p className="text-xs text-slate-600">Aucune réponse enregistrée pour cette mission.</p> : null}
          </div>
        ) : null}
        </div>
      </article>

      {canManageMission ? (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Disponibilité des bénévoles</h2>
            <button
              type="button"
              aria-expanded={isAvailabilityExpanded}
              aria-controls="mission-availability-content"
              aria-label={isAvailabilityExpanded ? 'Masquer la disponibilité des bénévoles' : 'Afficher la disponibilité des bénévoles'}
              onClick={() => setIsAvailabilityExpanded((current) => !current)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100"
            >
              <span className={`text-base leading-none transition-transform ${isAvailabilityExpanded ? 'rotate-180' : ''}`}>▾</span>
            </button>
          </div>

          {isAvailabilityExpanded ? (
            <>

              <div id="mission-availability-content" className="grid gap-2 text-xs text-slate-600 md:grid-cols-3">
                <p>Disponibles : <span className="font-semibold text-emerald-700">{proposalsByStatus.available}</span></p>
                <p>Indisponibles : <span className="font-semibold text-rose-700">{proposalsByStatus.unavailable}</span></p>
                <p>Sans réponse : <span className="font-semibold text-slate-700">{proposalsByStatus.no_response}</span></p>
              </div>

          <div className="max-h-80 overflow-y-auto rounded border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="w-12 px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Bénévole</th>
                  <th className="px-3 py-2 font-medium">Disponibilité</th>
                  <th className="px-3 py-2 font-medium">Modifié admin</th>
                  <th className="px-3 py-2 font-medium">Sélectionné</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {proposalsTableRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-3 text-slate-500">
                      Aucun bénévole lié à cette mission.
                    </td>
                  </tr>
                ) : (
                  proposalsTableRows.map((row, index) => (
                    <tr key={row.id} className={row.responseRowBackground}>
                      <td className="px-3 py-2 font-mono text-slate-500">{index + 1}</td>
                      <td className="space-y-1 px-3 py-2">
                        <p>{row.volunteerLabel}</p>
                        {row.matchingRequiredSkills.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {row.matchingRequiredSkills.map((skill) => (
                              <span key={`${row.id}-${skill}`} className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                                {skill}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-500">Aucune compétence requise identifiée</p>
                        )}
                      </td>
                      <td className={`px-3 py-2 font-medium ${row.responseTone}`}>{row.responseLabel}</td>
                      <td className="px-3 py-2 text-slate-500">{row.updatedByAdminLabel}</td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={pendingAssignments.has(row.volunteerId)}
                            onChange={() => toggleSelection(row.volunteerId)}
                            disabled={missionBlocksSelection || actionLoading === row.volunteerId || row.response !== 'available'}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </label>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowAvailabilityManagement((currentValue) => !currentValue)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {showAvailabilityManagement ? 'Masquer la gestion des dispos' : 'Gérer les dispos'}
            </button>
          </div>

          {showAvailabilityManagement ? (
            <>
              {isAdmin ? (
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <h3 className="text-sm font-semibold text-slate-900">Ajouter un bénévole à la mission</h3>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="text-xs text-slate-700">
                      Bénévole
                      <select
                        value={selectedVolunteerIdToAdd}
                        onChange={(event) => setSelectedVolunteerIdToAdd(event.target.value)}
                        className="mt-1 min-w-64 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      >
                        <option value="">Sélectionner un bénévole</option>
                        {availableVolunteersToAdd.map((volunteer) => (
                          <option key={volunteer.id} value={volunteer.id}>
                            {volunteer.full_name ?? volunteer.email}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs text-slate-700">
                      Statut initial
                      <select
                        value={selectedResponseToAdd}
                        onChange={(event) => setSelectedResponseToAdd(event.target.value as Exclude<MissionProposalResponse, 'no_response'>)}
                        className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      >
                        {adminResponseOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      onClick={addVolunteerWithStatus}
                      disabled={!selectedVolunteerIdToAdd || actionLoading === 'admin-add'}
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Ajouter
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                {proposals.map((proposal) => {
                  const adminActionLoadingKey = `admin-response-${proposal.volunteer_id}`;
                  const isSavingResponse = actionLoading === adminActionLoadingKey;
                  return (
                    <div key={proposal.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 p-3 text-sm text-slate-700">
                      <div>
                        <p className="font-medium">{proposal.volunteer?.full_name ?? proposal.volunteer?.email ?? proposal.volunteer_id}</p>
                        <p className="text-xs text-slate-500">Statut disponibilité : {getProposalResponseLabel(proposal.response)}</p>
                        {proposal.updated_by_admin ? (
                          <p className="mt-1 inline-flex rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs text-purple-700">
                            Modifié par un admin
                          </p>
                        ) : null}
                      </div>

                      {isAdmin ? (
                        <label className="text-xs text-slate-700">
                          Changer le statut
                          <select
                            value={proposal.response === 'no_response' ? 'available' : proposal.response}
                            onChange={(event) => setVolunteerResponseByAdmin(proposal.volunteer_id, event.target.value as Exclude<MissionProposalResponse, 'no_response'>)}
                            disabled={isSavingResponse}
                            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                          >
                            {adminResponseOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {showAvailabilityManagement ? (
            <>
              <div className="mt-3">
                <label className="text-sm text-slate-700">
                  Filtrer les bénévoles disponibles par compétence
                  <select
                    value={selectedVolunteerSkillCode}
                    onChange={(event) => setSelectedVolunteerSkillCode((event.target.value as SkillCode | 'all'))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm md:max-w-sm"
                  >
                    <option value="all">Toutes les compétences</option>
                    {volunteerSkillOptions.map((skill) => (
                      <option key={skill.code} value={skill.code}>
                        {skill.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {missionBlocksSelection ? <p className="text-sm text-slate-600">Mission verrouillée : sélection finale indisponible.</p> : null}

              <div className="space-y-2">
                {filteredEligibleProposals.map((proposal) => {
                  const isSelected = pendingAssignments.has(proposal.volunteer_id);
                  const isSaving = actionLoading === proposal.volunteer_id;
                  const explicitSkillNames = (proposal.volunteer?.profile_skills ?? [])
                    .map((profileSkill) => profileSkill.skill?.name)
                    .filter((skillName): skillName is string => Boolean(skillName));

                  const skillNames = Array.from(buildExpandedSkillSet(explicitSkillNames))
                    .sort(compareSkillCodes)
                    .map((skillCode) => getSkillLabel(skillCode));

                  return (
                    <div key={proposal.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 p-3 text-sm text-slate-700">
                      <div>
                        <p className="font-medium">{proposal.volunteer?.full_name ?? proposal.volunteer?.email ?? proposal.volunteer_id}</p>
                        <p className="text-xs text-slate-500">Réponse: {getProposalResponseLabel(proposal.response)}</p>
                        <p className="text-xs text-slate-500">Compétences: {skillNames.length > 0 ? skillNames.join(', ') : 'Aucune'}</p>
                      </div>
                      <button
                        type="button"
                        disabled={missionBlocksSelection || isSaving}
                        onClick={() => toggleSelection(proposal.volunteer_id)}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSaving ? 'Mise à jour...' : isSelected ? 'Retirer' : 'Retenir'}
                      </button>
                    </div>
                  );
                })}

                {eligibleProposals.length === 0 ? (
                  <p className="text-sm text-slate-600">Aucune réponse exploitable (disponible) pour composer l&apos;équipe.</p>
                ) : filteredEligibleProposals.length === 0 ? (
                  <p className="text-sm text-slate-600">Aucun résultat avec ce filtre de compétence.</p>
                ) : null}
              </div>

              <div className="rounded border border-slate-200 bg-slate-50 p-3">
                <h3 className="text-sm font-semibold text-slate-900">Bénévoles retenus ({assignments.length})</h3>
                {assignments.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-600">Aucun bénévole retenu.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {assignments.map((assignment) => (
                      <li key={assignment.id}>
                        {assignment.volunteer?.full_name ?? assignment.volunteer?.email ?? assignment.volunteer_id}
                        {' · '}
                        {requiredSkillNameById.get(assignment.mission_required_skill_id ?? '') ?? 'Sans compétence particulière'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Sélection de l&apos;équipage</h2>
            {mission.status === 'confirmed' ? (
              <p className="text-sm text-amber-700">
                L&apos;événement a été confirmé, il n&apos;est plus possible de changer la composition.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-expanded={isSkillsDirectoryExpanded}
            aria-controls="mission-skills-directory-content"
            aria-label={isSkillsDirectoryExpanded ? 'Masquer les compétences des bénévoles' : 'Afficher les compétences des bénévoles'}
            onClick={() => setIsSkillsDirectoryExpanded((current) => !current)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100"
          >
            <span className={`text-base leading-none transition-transform ${isSkillsDirectoryExpanded ? 'rotate-180' : ''}`}>▾</span>
          </button>
        </div>
        {isSkillsDirectoryExpanded ? (
          <div id="mission-skills-directory-content" className="mt-3 space-y-4">
            {requiredSkillsVolunteerDirectory.length === 0 ? (
              <p className="text-sm text-slate-600">Aucune compétence requise sur cette mission.</p>
            ) : (
              requiredSkillsVolunteerDirectory.map((skillGroup) => (
                <div key={skillGroup.requiredSkillId} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-900">{skillGroup.requiredSkillName}</h3>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        skillGroup.volunteers.filter((volunteer) => pendingAssignments.get(volunteer.id) === skillGroup.requiredSkillId).length >=
                        skillGroup.requiredCount
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {skillGroup.volunteers.filter((volunteer) => pendingAssignments.get(volunteer.id) === skillGroup.requiredSkillId).length}/
                      {skillGroup.requiredCount}
                    </span>
                  </div>
                  {skillGroup.volunteers.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-600">Aucun bénévole correspondant pour le moment.</p>
                  ) : (
                    <ul className="mt-3 flex flex-wrap gap-4">
                      {skillGroup.volunteers.map((volunteer) => {
                        const selectedSkillId = pendingAssignments.get(volunteer.id);
                        const isSelectedOnThisSkill = selectedSkillId === skillGroup.requiredSkillId;
                        const isSelectedElsewhere = Boolean(selectedSkillId) && selectedSkillId !== skillGroup.requiredSkillId;
                        const canToggle =
                          canManageMission && !missionBlocksSelection && actionLoading !== volunteer.id && !isSelectedElsewhere;

                        return (
                          <li key={`${skillGroup.requiredSkillId}-${volunteer.id}`} className="group/volunteer relative w-24 text-center">
                            <button
                              type="button"
                              onClick={() => toggleSelection(volunteer.id, skillGroup.requiredSkillId)}
                              disabled={!canToggle}
                              className={`group w-full rounded-md p-1 transition ${
                                isSelectedOnThisSkill
                                  ? 'bg-emerald-50 ring-1 ring-emerald-300'
                                  : isSelectedElsewhere
                                    ? 'cursor-not-allowed bg-slate-100 opacity-45'
                                  : 'hover:bg-slate-50'
                              } ${
                                !canToggle ? 'cursor-not-allowed opacity-45' : ''
                              }`}
                            >
                              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-sm font-semibold text-slate-700">
                                {isSelectedElsewhere ? (
                                  <>
                                    <span className="group-hover:hidden">{volunteer.initials || 'B'}</span>
                                    <span className="hidden px-1 text-[9px] leading-tight text-center group-hover:block">
                                      Retenu en tant que {requiredSkillNameById.get(selectedSkillId ?? '') ?? 'autre compétence'}
                                    </span>
                                  </>
                                ) : (
                                  volunteer.initials || 'B'
                                )}
                              </div>
                              <p className="mt-2 text-xs text-slate-700">{volunteer.fullName}</p>
                            </button>
                            <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-56 -translate-x-1/2 rounded-md border border-slate-200 bg-white p-2 text-left text-xs text-slate-700 shadow-lg group-hover/volunteer:block">
                              <p className="font-semibold text-slate-900">Compétences</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {Array.from(
                                  buildExpandedSkillSet(
                                    (proposals.find((proposal) => proposal.volunteer_id === volunteer.id)?.volunteer?.profile_skills ?? [])
                                      .map((profileSkill) => profileSkill.skill?.name)
                                      .filter((skillName): skillName is string => Boolean(skillName))
                                  )
                                ).map((skillCode) => (
                                  <span key={`${volunteer.id}-${skillCode}`} className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                                    {getSkillLabel(skillCode)}
                                  </span>
                                ))}
                              </div>
                              <p className="mt-2">Dernière activité : {formatElapsedSince(volunteerActivityStats[volunteer.id]?.lastActivityAt ?? null)}</p>
                              <p>Activités (30j) : {volunteerActivityStats[volunteer.id]?.monthlyCount ?? 0}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))
            )}

            {canManageMission ? (
              <div className="sticky bottom-3 flex justify-end">
                <button
                  type="button"
                  onClick={confirmCrewSelection}
                  disabled={missionBlocksSelection || actionLoading === 'confirm-selection' || actionLoading === 'save-selection'}
                  className={`rounded-full px-4 py-2 text-sm font-medium text-white shadow ${
                    areSkillConstraintsMet ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-slate-400 hover:bg-slate-500'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {actionLoading === 'confirm-selection' || actionLoading === 'save-selection'
                    ? 'Confirmation...'
                    : "Confirmer la sélection de l'équipage"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Slack</h2>
          <button
            type="button"
            aria-expanded={isSlackCardExpanded}
            aria-controls="mission-slack-content"
            aria-label={isSlackCardExpanded ? 'Masquer la carte Slack' : 'Afficher la carte Slack'}
            onClick={() => setIsSlackCardExpanded((current) => !current)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100"
          >
            <span className={`text-base leading-none transition-transform ${isSlackCardExpanded ? 'rotate-180' : ''}`}>▾</span>
          </button>
        </div>

        {isSlackCardExpanded ? (
          <div id="mission-slack-content" className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <label className="mt-2 block text-sm">
              Nom du canal Slack proposé
              <input
                type="text"
                value={slackChannelNameDraft}
                onChange={(event) => setSlackChannelNameDraft(event.target.value)}
                disabled={isSlackChannelCreated}
                title={mission.slack_channel_id ? `${mission.slack_channel_name} (${mission.slack_channel_id})` : undefined}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
            </label>
            <label className="mt-2 block text-sm">
              Message d&apos;accueil proposé
              <textarea
                value={slackMessageDraft}
                onChange={(event) => setSlackMessageDraft(event.target.value)}
                disabled={isSlackChannelCreated}
                rows={4}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
            </label>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={syncSlackChannel}
                disabled={slackCreationState === 'creating' || isSlackChannelCreated}
                title={mission.slack_channel_id ? `${mission.slack_channel_name} (${mission.slack_channel_id})` : undefined}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  slackCreationState === 'idle' && !isSlackChannelCreated
                    ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                    : 'cursor-not-allowed border-slate-300 bg-slate-200 text-slate-500'
                }`}
              >
                {slackCreationState === 'creating'
                  ? 'Création en cours'
                  : isSlackChannelCreated
                    ? 'Canal créé'
                    : 'Confirmer la création du canal Slack'}
              </button>
            </div>
            <label className="mt-4 block text-sm">
              Message libre à envoyer
              <textarea
                value={slackFreeMessageDraft}
                onChange={(event) => setSlackFreeMessageDraft(event.target.value)}
                rows={3}
                disabled={!mission.slack_channel_id}
                placeholder={mission.slack_channel_id ? 'Tapez votre message Slack…' : 'Créez d’abord le canal Slack'}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
            </label>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={sendSlackFreeMessage}
                disabled={!mission.slack_channel_id || actionLoading === 'send-slack-message' || !slackFreeMessageDraft.trim()}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                {actionLoading === 'send-slack-message' ? 'Envoi en cours...' : 'Envoyer le message'}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Historique</h2>
          <button
            type="button"
            aria-expanded={isHistoryExpanded}
            aria-controls="mission-history-content"
            aria-label={isHistoryExpanded ? "Masquer l'historique" : "Afficher l'historique"}
            onClick={() => setIsHistoryExpanded((current) => !current)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100"
          >
            <span className={`text-base leading-none transition-transform ${isHistoryExpanded ? 'rotate-180' : ''}`}>▾</span>
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-600">Événements récents de la mission, du plus récent au plus ancien.</p>

        {isHistoryExpanded ? (
          <div id="mission-history-content" className="mt-3 space-y-3">
          <label className="block">
            <span className="sr-only">Rechercher dans l&apos;historique</span>
            <input
              type="search"
              value={activitySearch}
              onChange={(event) => setActivitySearch(event.target.value)}
              placeholder="Rechercher dans l'historique"
              className="w-full rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-700 placeholder:text-slate-500 focus:border-emerald-500 focus:bg-white focus:outline-none"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedActivityType('all')}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                selectedActivityType === 'all'
                  ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                  : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Toutes {activityLogs.length}
            </button>
            {Object.entries(ACTIVITY_TYPE_LABELS).map(([type, label]) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedActivityType(type as ActivityLog['action_type'])}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                  selectedActivityType === type
                    ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {label} {activityTypeCounts[type as ActivityLog['action_type']]}
              </button>
            ))}
          </div>
          {activityLogs.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">Aucun historique disponible pour cette mission.</p>
          ) : filteredActivityLogs.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">Aucun résultat avec ces filtres.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {filteredActivityLogs.map((log) => (
                <li key={log.id} className={`rounded border p-3 text-sm text-slate-700 ${ACTIVITY_TYPE_TINTS[log.action_type]}`}>
                  <p className="font-medium">{log.description}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(log.created_at).toLocaleString('fr-FR')} · {log.actor?.full_name ?? log.actor?.email ?? 'Système'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        ) : null}
      </section>

    </div>
  );
}
