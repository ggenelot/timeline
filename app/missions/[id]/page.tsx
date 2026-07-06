'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { MissionStatusBadge } from '@/components/missions/mission-status-badge';
import { ProposalButton } from '@/components/missions/proposal-button';
import { StatusBadge } from '@/components/missions/status-badge';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { SkillBadge, getSkillDotColor } from '@/components/skills/skill-badge';
import { resolveMissionTypeColor } from '@/lib/mission-timeline';
import { MissionMaterielAssignmentPicker, CandidateContainer } from '@/components/missions/mission-materiel-assignment-picker';
import { supabase } from '@/lib/supabase/client';
import {
  ActivityAct,
  ActivityLog,
  Mission,
  MissionAssignment,
  MissionAssignmentStatus,
  MissionProposal,
  MissionProposalResponse,
  MissionRequiredMateriel,
  MissionRequiredSkill,
  Profile,
  ProfileSkill,
  RoleBehavior
} from '@/lib/types';
import { formatMissionRequirementLabel, getProposalResponseLabel } from '@/lib/missions';
import { getCandidateActivity } from '@/lib/queries/activity';
import { MissionActivityPanel } from '@/components/activity/MissionActivityPanel';

type ProposalWithVolunteer = MissionProposal & {
  volunteer: (Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'> & {
    profile_skills?: ProfileSkill[] | null;
  }) | null;
};

type VolunteerOption = Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'>;

type AssignmentWithVolunteer = MissionAssignment & {
  volunteer: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'> | null;
};

type MissionWithSkills = Mission & {
  mission_required_skills: MissionRequiredSkill[] | null;
};

type ActivityLogWithActor = ActivityLog & {
  actor: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
};

type MissionTypeInfo = { id: string; name: string; color: string };

const ACTIVITY_TYPE_LABELS: Record<ActivityLog['action_type'], string> = {
  mission_created: 'Création',
  mission_status_changed: 'Statut',
  proposal_response_updated: 'Réponse',
  volunteer_selected: 'Retenu',
  volunteer_removed: 'Retiré'
};

const NO_SKILL_SELECTION_ID = '__no_skill_selection__';

function getDefaultSlackChannelName(title: string, startsAt: string) {
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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

function computeInitials(label: string): string {
  return (label || 'B')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function formatDayLabel(dateIso: string): string {
  const date = new Date(dateIso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Hier';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function MissionDetailPage() {
  const params = useParams<{ id: string }>();
  const missionId = params.id;
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mission, setMission] = useState<MissionWithSkills | null>(null);
  const [missionTypeInfo, setMissionTypeInfo] = useState<MissionTypeInfo | null>(null);
  const [skillColorById, setSkillColorById] = useState<Record<string, string | null>>({});
  const [proposals, setProposals] = useState<ProposalWithVolunteer[]>([]);
  const [assignments, setAssignments] = useState<AssignmentWithVolunteer[]>([]);
  const [requiredMateriels, setRequiredMateriels] = useState<MissionRequiredMateriel[]>([]);
  const [candidateContainers, setCandidateContainers] = useState<CandidateContainer[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogWithActor[]>([]);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [isSkillsDirectoryExpanded, setIsSkillsDirectoryExpanded] = useState(true);
  const [isAvailabilityExpanded, setIsAvailabilityExpanded] = useState(true);
  const [isSlackCardExpanded, setIsSlackCardExpanded] = useState(false);
  const [recapEditing, setRecapEditing] = useState(false);
  const [slackChannelNameDraft, setSlackChannelNameDraft] = useState('');
  const [slackMessageDraft, setSlackMessageDraft] = useState('');
  const [slackFreeMessageDraft, setSlackFreeMessageDraft] = useState('');
  const [activitySearch, setActivitySearch] = useState('');
  const [selectedActivityType, setSelectedActivityType] = useState<'all' | ActivityLog['action_type']>('all');
  const [allVolunteers, setAllVolunteers] = useState<VolunteerOption[]>([]);
  const [availabilitySearchQuery, setAvailabilitySearchQuery] = useState('');
  const [availabilityStatusFilter, setAvailabilityStatusFilter] = useState<'all' | MissionProposalResponse>('all');
  const [pendingAssignments, setPendingAssignments] = useState<Map<string, string>>(new Map());
  const [supportsMissionRequiredSkillReference, setSupportsMissionRequiredSkillReference] = useState(true);
  const [volunteerActivityStats, setVolunteerActivityStats] = useState<Record<string, { lastActivityAt: string | null; monthlyCount: number }>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [slackCreationState, setSlackCreationState] = useState<'idle' | 'creating' | 'created'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [canManageByRole, setCanManageByRole] = useState(false);
  const [activityActs, setActivityActs] = useState<ActivityAct[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [isActivityExpanded, setIsActivityExpanded] = useState(false);

  const myProposal = useMemo(() => proposals.find((proposal) => proposal.volunteer_id === profile?.id) ?? null, [profile?.id, proposals]);

  const eligibleProposals = useMemo(() => proposals.filter((proposal) => proposal.response === 'available'), [proposals]);

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

  const requiredSkills = useMemo(() => {
    return (mission?.mission_required_skills ?? []).map((rs) => ({
      id: rs.id,
      skill_id: rs.skill_id,
      category_id: rs.skill?.category_id ?? null,
      display_order: rs.skill?.display_order ?? 0,
      name: rs.skill?.name ?? null,
      quantity: rs.quantity ?? 0
    }));
  }, [mission?.mission_required_skills]);

  const proposalsTableRows = useMemo(() => {
    const proposalByVolunteerId = new Map(proposals.map((proposal) => [proposal.volunteer_id, proposal]));
    const responsePriority: Record<MissionProposalResponse, number> = { available: 0, unavailable: 1, no_response: 2 };

    const rows = allVolunteers.map((volunteer) => {
      const proposal = proposalByVolunteerId.get(volunteer.id);
      const response = proposal?.response ?? 'no_response';
      const volunteerLabel = volunteer.full_name ?? volunteer.email ?? volunteer.id;

      const volunteerSkills = proposal
        ? (proposal.volunteer?.profile_skills ?? []).map((ps) => {
            const s = Array.isArray(ps.skill) ? ps.skill[0] : ps.skill;
            return s ? { id: s.id, category_id: s.category_id ?? null, display_order: s.display_order ?? 0, name: s.name } : null;
          }).filter((s): s is NonNullable<typeof s> => s !== null)
        : [];

      const matchingRequiredSkills = proposal
        ? requiredSkills
            .filter((req) => {
              if (!req.category_id) return true;
              return volunteerSkills.some(
                (vs) => vs.category_id === req.category_id && vs.display_order >= req.display_order
              );
            })
            .map((req) => req.name ?? 'Bénévole')
        : [];

      return {
        id: proposal?.id ?? `unlinked-${volunteer.id}`,
        volunteerId: volunteer.id,
        volunteerLabel,
        initials: computeInitials(volunteerLabel),
        avatarUrl: volunteer.avatar_url ?? null,
        volunteerSkills,
        matchingRequiredSkills,
        response,
        responseLabel: getProposalResponseLabel(response),
        updatedByAdmin: proposal?.updated_by_admin ?? false,
        respondedAt: proposal?.responded_at ?? null,
        statusPriority: responsePriority[response]
      };
    });

    return rows.sort((rowA, rowB) => {
      if (rowA.statusPriority !== rowB.statusPriority) return rowA.statusPriority - rowB.statusPriority;
      if (rowA.response === 'available' && rowB.response === 'available') {
        const rowATime = rowA.respondedAt ? new Date(rowA.respondedAt).getTime() : Number.POSITIVE_INFINITY;
        const rowBTime = rowB.respondedAt ? new Date(rowB.respondedAt).getTime() : Number.POSITIVE_INFINITY;
        if (rowATime !== rowBTime) return rowATime - rowBTime;
      }
      return rowA.volunteerLabel.localeCompare(rowB.volunteerLabel, 'fr', { sensitivity: 'base' });
    });
  }, [allVolunteers, proposals, requiredSkills]);

  const filteredProposalsTableRows = useMemo(() => {
    const normalizedSearch = availabilitySearchQuery.trim().toLocaleLowerCase('fr-FR');

    return proposalsTableRows.filter((row) => {
      if (availabilityStatusFilter !== 'all' && row.response !== availabilityStatusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchableContent = [row.volunteerLabel, ...row.matchingRequiredSkills, ...row.volunteerSkills.map((s) => s.name)]
        .join(' ')
        .toLocaleLowerCase('fr-FR');
      return searchableContent.includes(normalizedSearch);
    });
  }, [availabilitySearchQuery, availabilityStatusFilter, proposalsTableRows]);

  useEffect(() => {
    setPendingAssignments(
      new Map(
        assignments.map((assignment) => [
          assignment.volunteer_id,
          assignment.mission_required_skill_id ?? NO_SKILL_SELECTION_ID
        ])
      )
    );
  }, [assignments]);

  const requiredSkillsVolunteerDirectory = useMemo(() => {
    const requiredSkillsWithQty = (mission?.mission_required_skills ?? []).map((requiredSkill) => ({
      id: requiredSkill.id,
      skillId: requiredSkill.skill_id,
      name: requiredSkill.skill?.name ?? null,
      quantity: requiredSkill.quantity ?? 0,
      category_id: requiredSkill.skill?.category_id ?? null,
      display_order: requiredSkill.skill?.display_order ?? 0,
    }));

    const availableVolunteers = eligibleProposals
      .map((proposal) => {
        if (!proposal.volunteer) return null;
        const fullName = proposal.volunteer.full_name ?? proposal.volunteer.email ?? 'Bénévole';
        return { id: proposal.volunteer.id, fullName, initials: computeInitials(fullName), avatarUrl: proposal.volunteer.avatar_url ?? null };
      })
      .filter((volunteer): volunteer is { id: string; fullName: string; initials: string; avatarUrl: string | null } => Boolean(volunteer));

    const skillGroups = requiredSkillsWithQty.map((requiredSkill) => {
      const volunteers = eligibleProposals
        .map((proposal) => {
          const volunteerSkills = (proposal.volunteer?.profile_skills ?? []).map((ps) => {
            const s = Array.isArray(ps.skill) ? ps.skill[0] : ps.skill;
            return s ? { category_id: s.category_id ?? null, display_order: s.display_order ?? 0 } : null;
          }).filter((s): s is NonNullable<typeof s> => s !== null);

          const matchesRequiredSkill = !requiredSkill.category_id || volunteerSkills.some(
            (vs) => vs.category_id === requiredSkill.category_id && vs.display_order >= requiredSkill.display_order
          );

          if (!matchesRequiredSkill || !proposal.volunteer) {
            return null;
          }

          const fullName = proposal.volunteer.full_name ?? proposal.volunteer.email ?? 'Bénévole';
          return { id: proposal.volunteer.id, fullName, initials: computeInitials(fullName), avatarUrl: proposal.volunteer.avatar_url ?? null };
        })
        .filter((volunteer): volunteer is { id: string; fullName: string; initials: string; avatarUrl: string | null } => Boolean(volunteer));

      const uniqueVolunteers = volunteers.filter((volunteer, index, list) => list.findIndex((entry) => entry.id === volunteer.id) === index);

      return {
        requiredSkillId: requiredSkill.id,
        skillId: requiredSkill.skillId,
        requiredSkillName: requiredSkill.name ?? 'Sans compétence particulière (bénévole)',
        requiredCount: requiredSkill.quantity,
        volunteers: uniqueVolunteers
      };
    });

    const hasUnassignedPool = availableVolunteers.length > 0;
    if (!hasUnassignedPool) {
      return skillGroups;
    }

    return [
      ...skillGroups,
      {
        requiredSkillId: NO_SKILL_SELECTION_ID,
        skillId: null,
        requiredSkillName: 'Sans compétence particulière',
        requiredCount: 0,
        volunteers: availableVolunteers
      }
    ];
  }, [eligibleProposals, mission?.mission_required_skills]);

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

  const activityLogGroups = useMemo(() => {
    const groups: Array<{ label: string; events: ActivityLogWithActor[] }> = [];
    filteredActivityLogs.forEach((log) => {
      const label = formatDayLabel(log.created_at);
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.label === label) {
        lastGroup.events.push(log);
      } else {
        groups.push({ label, events: [log] });
      }
    });
    return groups;
  }, [filteredActivityLogs]);

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
    setAllVolunteers(
      (payload.volunteers ?? []).map(({ id: volunteerId, full_name, email, avatar_url }) => ({ id: volunteerId, full_name, email, avatar_url }))
    );
  }

  async function loadMaterielAssignments(id: string) {
    const { data: requirementsData, error: requirementsErr } = await supabase
      .from('mission_required_materiels')
      .select('id,mission_id,category_id,quantity,created_at,category:materiel_categories(id,name,color),assignments:mission_materiel_assignments(id,mission_required_materiel_id,materiel_type_id,assigned_by,created_at,materiel_type:materiel_types(id,name,code))')
      .eq('mission_id', id);

    if (requirementsErr || !requirementsData) {
      setRequiredMateriels([]);
      setCandidateContainers([]);
      return;
    }

    const mappedRequirements = requirementsData.map((requirement) => ({
      ...requirement,
      category: Array.isArray(requirement.category) ? requirement.category[0] ?? null : requirement.category,
      assignments: (requirement.assignments ?? []).map((assignment) => ({
        ...assignment,
        materiel_type: Array.isArray(assignment.materiel_type) ? assignment.materiel_type[0] ?? null : assignment.materiel_type
      }))
    }));
    setRequiredMateriels(mappedRequirements);

    const categoryIds = Array.from(new Set(mappedRequirements.map((requirement) => requirement.category_id)));
    if (categoryIds.length > 0) {
      const [containersResult, contentsResult] = await Promise.all([
        supabase.from('materiel_types').select('id,name,code,category_id').eq('is_container', true).in('category_id', categoryIds),
        supabase.from('materiel_type_contents').select('child_type_id')
      ]);
      const nestedContainerIds = new Set((contentsResult.data ?? []).map((row) => row.child_type_id));
      setCandidateContainers((containersResult.data ?? []).filter((c) => !nestedContainerIds.has(c.id)));
    } else {
      setCandidateContainers([]);
    }
  }

  async function refreshActivityLogs(id: string) {
    const { data: logData } = await supabase
      .from('activity_logs')
      .select('id,mission_id,actor_id,action_type,entity_type,entity_id,description,created_at,actor:profiles!activity_logs_actor_id_fkey(id,full_name,email)')
      .eq('mission_id', id)
      .order('created_at', { ascending: false })
      .limit(50);

    setActivityLogs(
      (logData ?? []).map((log) => ({
        ...log,
        actor: Array.isArray(log.actor) ? log.actor[0] ?? null : log.actor
      }))
    );
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
      .select('id,full_name,email,role,sector,created_at,slack_user_id,slack_team_id,slack_connected_at')
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
        'id,title,description,location,mission_type_id,starts_at,ends_at,required_volunteers,status,created_by,created_at,slack_channel_id,slack_channel_name,slack_channel_created_at,mission_required_skills(id,mission_id,skill_id,quantity,created_at,skill:skills(id,name,category_id,display_order))'
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

    const { data: missionTypeData } = await supabase
      .from('mission_types')
      .select('id,name,color')
      .eq('id', mappedMission.mission_type_id)
      .maybeSingle();

    if (missionTypeData) {
      setMissionTypeInfo({
        id: missionTypeData.id,
        name: missionTypeData.name,
        color: resolveMissionTypeColor(missionTypeData.name, missionTypeData.color)
      });
    }

    const { data: skillRowsData } = await supabase.from('skills').select('id,skill_categories(color)');
    const nextSkillColorById: Record<string, string | null> = {};
    (skillRowsData ?? []).forEach((row) => {
      const category = Array.isArray(row.skill_categories) ? row.skill_categories[0] ?? null : row.skill_categories;
      nextSkillColorById[row.id] = (category as { color?: string | null } | null)?.color ?? null;
    });
    setSkillColorById(nextSkillColorById);

    const { data: statusData } = await supabase
      .from('skill_statuses')
      .select('key')
      .eq('is_validating', true);
    const validatingStatusKeys = new Set((statusData ?? []).map((s) => s.key));

    const { data: proposalData, error: proposalsError } = await supabase
      .from('mission_proposals')
      .select(
        'id,mission_id,volunteer_id,proposed_by,response,status,decided_at,decided_by,updated_by_admin,updated_by,responded_at,updated_at,source,created_at,volunteer:profiles!mission_proposals_volunteer_id_fkey(id,full_name,email,avatar_url,profile_skills(profile_id,skill_id,status,created_at,skill:skills(id,name,category_id,display_order)))'
      )
      .eq('mission_id', missionId)
      .order('created_at', { ascending: true });

    if (proposalsError) {
      setError(proposalsError.message);
      setLoading(false);
      return;
    }

    let assignmentData: Array<MissionAssignment & { volunteer: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'>[] | Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'> | null }> | null = null;
    let assignmentsError: { message: string } | null = null;
    let assignmentQuerySupportsSkillReference = true;

    const assignmentsWithRequiredSkill = await supabase
      .from('mission_assignments')
      .select('id,mission_id,volunteer_id,mission_required_skill_id,assignment_status,created_at,volunteer:profiles!mission_assignments_volunteer_id_fkey(id,full_name,email,avatar_url)')
      .eq('mission_id', missionId)
      .order('created_at', { ascending: true });

    if (assignmentsWithRequiredSkill.error?.message.includes('mission_assignments.mission_required_skill_id')) {
      assignmentQuerySupportsSkillReference = false;
      const assignmentsWithoutRequiredSkill = await supabase
        .from('mission_assignments')
        .select('id,mission_id,volunteer_id,assignment_status,created_at,volunteer:profiles!mission_assignments_volunteer_id_fkey(id,full_name,email,avatar_url)')
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

    const mappedProposals: ProposalWithVolunteer[] = (proposalData ?? []).map((proposal) => {
      const volunteer = Array.isArray(proposal.volunteer) ? proposal.volunteer[0] ?? null : proposal.volunteer;

      return {
        ...proposal,
        volunteer: volunteer
          ? {
              ...volunteer,
              // Seules les compétences dont le statut est marqué « validant »
              // qualifient un bénévole (matching des compétences requises,
              // visibilité). Les autres statuts du tableau de bord ne doivent
              // pas rendre un bénévole éligible.
              profile_skills: (volunteer.profile_skills ?? [])
                .filter((profileSkill) => profileSkill.status && validatingStatusKeys.has(profileSkill.status))
                .map((profileSkill) => ({
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

    setProposals(mappedProposals);
    setAssignments(mappedAssignments);
    await refreshActivityLogs(missionId);

    const since = new Date();
    since.setMonth(since.getMonth() - 1);
    const uniqueVolunteerIds = mappedProposals
      .map((proposal) => proposal.volunteer_id)
      .filter((value, index, list) => list.indexOf(value) === index);

    const nextVolunteerActivityStats: Record<string, { lastActivityAt: string | null; monthlyCount: number }> = {};
    uniqueVolunteerIds.forEach((volunteerId) => {
      nextVolunteerActivityStats[volunteerId] = { lastActivityAt: null, monthlyCount: 0 };
    });

    if (uniqueVolunteerIds.length > 0) {
      const { data: activityRows } = await supabase
        .from('mission_assignments')
        .select('volunteer_id, created_at')
        .in('volunteer_id', uniqueVolunteerIds)
        .order('created_at', { ascending: false });

      (activityRows ?? []).forEach((row) => {
        const stat = nextVolunteerActivityStats[row.volunteer_id];
        if (!stat) return;
        if (!stat.lastActivityAt) stat.lastActivityAt = row.created_at;
        if (new Date(row.created_at) >= since) stat.monthlyCount += 1;
      });
    }

    setVolunteerActivityStats(nextVolunteerActivityStats);

    let canManage = false;
    if (profileData.role !== 'admin' && mappedMission) {
      const tok = await getAccessToken();
      const rolesRes = await fetch('/api/roles/mine', { headers: { Authorization: `Bearer ${tok}` } });
      if (rolesRes.ok) {
        const rolesJson = (await rolesRes.json()) as { behaviors: RoleBehavior[] };
        const canManageBehaviors = rolesJson.behaviors.filter((b) => b.resource_type === 'mission' && b.behavior_type === 'can_manage');
        const hasManageAll = canManageBehaviors.some((b) => (b.mission_type_ids ?? []).length === 0);
        canManage = hasManageAll || canManageBehaviors.some((b) =>
          (b.mission_type_ids ?? []).includes(mappedMission.mission_type_id)
        );
        setCanManageByRole(canManage);
      }
    }

    if (profileData.role === 'admin' || canManage) {
      try {
        const acts = await getCandidateActivity(missionId);
        setActivityActs(acts);
        setActivityError(null);
      } catch (err) {
        // L'activité n'est pas critique : on ne bloque pas le chargement de la page,
        // mais on remonte l'erreur dans le panneau plutôt que de la masquer.
        setActivityActs([]);
        setActivityError((err as Error).message || 'Erreur inconnue');
      }
    }

    if (profileData.role === 'admin' || canManage) {
      await loadAdminVolunteerDirectory(missionId);
    }

    if (profileData.role === 'admin') {
      await loadMaterielAssignments(missionId);
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
    return <p className="text-sm text-ink-2">Chargement du détail mission...</p>;
  }

  if (!mission) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-bad">{error ?? 'Mission introuvable.'}</p>
        <Link href="/missions" className="text-sm font-medium text-brand underline">
          Retour à la liste
        </Link>
      </div>
    );
  }

  const canManageMission = profile?.role === 'admin' || (canManageByRole && mission.created_by === user?.id);
  const missionBlocksSelection = mission.status === 'cancelled';
  const isSlackChannelCreated = Boolean(mission.slack_channel_id) || slackCreationState === 'created';
  const showSelection = mission.status !== 'confirmed' || recapEditing;
  const showRecap = mission.status === 'confirmed' && !recapEditing;

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

    const payload = (await request.json()) as { error?: string; message?: string; proposal?: ProposalWithVolunteer; slackError?: string };

    if (!request.ok) {
      setError(payload.error ?? 'Impossible de modifier le statut bénévole.');
      setActionLoading(null);
      return;
    }

    if (payload.proposal) {
      setProposals((current) => {
        const updatedProposal = payload.proposal as ProposalWithVolunteer;
        const existingIndex = current.findIndex((proposal) => proposal.volunteer_id === updatedProposal.volunteer_id);
        if (existingIndex === -1) {
          return [...current, updatedProposal];
        }

        // L'API ne renvoie pas profile_skills sur le volontaire : on les conserve depuis l'état précédent
        // pour éviter de perdre les badges de compétences déjà chargés.
        const previousSkills = current[existingIndex].volunteer?.profile_skills ?? null;
        const next = [...current];
        next[existingIndex] = {
          ...updatedProposal,
          volunteer: updatedProposal.volunteer
            ? { ...updatedProposal.volunteer, profile_skills: updatedProposal.volunteer.profile_skills ?? previousSkills }
            : current[existingIndex].volunteer
        };
        return next;
      });
    }

    if (request.status === 202) {
      const slackFailureDetail = payload.slackError ? ` Détail: ${payload.slackError}` : '';
      setError(`Le statut bénévole a bien été enregistré, mais la notification Slack a échoué.${slackFailureDetail}`);
    }

    setSuccess(payload.message ?? 'Statut bénévole mis à jour.');
    setActionLoading(null);
  }

  async function toggleSelection(volunteerId: string, requiredSkillId: string) {
    if (!mission || missionBlocksSelection) {
      return;
    }

    setPendingAssignments((current) => {
      const next = new Map(current);
      if (next.get(volunteerId) === requiredSkillId) {
        next.delete(volunteerId);
      } else {
        next.set(volunteerId, requiredSkillId);
      }
      return next;
    });
  }

  async function saveCrewSelection(): Promise<boolean> {
    if (!mission || missionBlocksSelection) {
      return false;
    }

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
        return false;
      }
    }

    let insertedRows: Array<{
      id: string;
      volunteer_id: string;
      mission_required_skill_id: string | null;
      assignment_status: MissionAssignmentStatus;
      created_at: string;
    }> = [];
    if (toInsert.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from('mission_assignments')
        .insert(
          toInsert.map((volunteerId) => ({
            mission_id: mission.id,
            volunteer_id: volunteerId,
            ...(supportsMissionRequiredSkillReference
              ? {
                  mission_required_skill_id:
                    pendingAssignments.get(volunteerId) === NO_SKILL_SELECTION_ID ? null : pendingAssignments.get(volunteerId) ?? null
                }
              : {}),
            assignment_status: 'selected'
          }))
        )
        .select(
          supportsMissionRequiredSkillReference
            ? 'id,volunteer_id,mission_required_skill_id,assignment_status,created_at'
            : 'id,volunteer_id,assignment_status,created_at'
        );
      if (insertError) {
        setError(`Impossible de mettre à jour la sélection : ${insertError.message}`);
        return false;
      }
      const insertedRaw = (inserted ?? []) as unknown as Array<{
        id: string;
        volunteer_id: string;
        mission_required_skill_id?: string | null;
        assignment_status: MissionAssignmentStatus;
        created_at: string;
      }>;
      insertedRows = insertedRaw.map((row) => ({ ...row, mission_required_skill_id: row.mission_required_skill_id ?? null }));
    }

    for (const assignment of toUpdate) {
      const { error: updateError } = await supabase
        .from('mission_assignments')
        .update({
          mission_required_skill_id:
            pendingAssignments.get(assignment.volunteer_id) === NO_SKILL_SELECTION_ID
              ? null
              : pendingAssignments.get(assignment.volunteer_id) ?? null
        })
        .eq('id', assignment.id);
      if (updateError) {
        setError(`Impossible de mettre à jour la sélection : ${updateError.message}`);
        return false;
      }
    }

    const volunteerLookup = new Map<string, Pick<Profile, 'id' | 'full_name' | 'email'>>();
    proposals.forEach((proposal) => {
      if (proposal.volunteer) volunteerLookup.set(proposal.volunteer_id, proposal.volunteer);
    });
    allVolunteers.forEach((volunteer) => volunteerLookup.set(volunteer.id, volunteer));

    setAssignments((current) => {
      const withoutDeleted = current.filter((assignment) => !toDelete.includes(assignment.volunteer_id));
      const withUpdates = withoutDeleted.map((assignment) => {
        const pendingSkillId = pendingAssignments.get(assignment.volunteer_id);
        if (pendingSkillId === undefined) return assignment;
        const resolvedSkillId = pendingSkillId === NO_SKILL_SELECTION_ID ? null : pendingSkillId;
        if (resolvedSkillId === assignment.mission_required_skill_id) return assignment;
        return { ...assignment, mission_required_skill_id: resolvedSkillId };
      });
      const inserted: AssignmentWithVolunteer[] = insertedRows.map((row) => ({
        ...row,
        mission_id: mission.id,
        mission_required_skill_id: row.mission_required_skill_id ?? null,
        volunteer: volunteerLookup.get(row.volunteer_id) ?? null
      }));
      return [...withUpdates, ...inserted];
    });

    return true;
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

  // Seule action de confirmation de toute la page : confirme l'événement,
  // crée le canal Slack, puis bascule équipage + matériel sur le récapitulatif.
  async function confirmAndCreateSlackChannel() {
    if (!mission) return;

    const needsConfirm = mission.status !== 'confirmed';

    if (needsConfirm && !areSkillConstraintsMet) {
      setError('Les contraintes de compétences ne sont pas encore atteintes.');
      return;
    }

    setActionLoading('confirm-and-slack');
    setError(null);
    setSuccess(null);

    const token = await getAccessToken();
    if (!token) {
      setError('Session invalide. Reconnectez-vous puis réessayez.');
      setActionLoading(null);
      return;
    }

    if (needsConfirm) {
      const savedCrew = await saveCrewSelection();
      if (!savedCrew) {
        setActionLoading(null);
        return;
      }

      const confirmResponse = await fetch(`/api/admin/missions/${mission.id}/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const confirmPayload = (await confirmResponse.json()) as { error?: string; message?: string };
      if (!confirmResponse.ok) {
        setError(confirmPayload.error ?? 'Confirmation impossible.');
        setActionLoading(null);
        return;
      }

      setMission((current) => (current ? { ...current, status: 'confirmed' } : current));
      setRecapEditing(false);
      await refreshActivityLogs(mission.id);
    }

    setSlackCreationState('creating');

    const slackResponse = await fetch(`/api/admin/missions/${mission.id}/slack-sync`, {
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

    const slackPayload = (await slackResponse.json()) as {
      error?: string;
      message?: string;
      channel?: { channelId: string | null; channelName: string; created: boolean };
    };

    if (!slackResponse.ok) {
      setError(slackPayload.error ?? 'Synchronisation Slack impossible.');
      setActionLoading(null);
      setSlackCreationState('idle');
      return;
    }

    if (slackPayload.channel) {
      setMission((current) =>
        current
          ? {
              ...current,
              slack_channel_id: slackPayload.channel?.channelId ?? current.slack_channel_id,
              slack_channel_name: slackPayload.channel?.channelName ?? current.slack_channel_name,
              slack_channel_created_at: slackPayload.channel?.created
                ? new Date().toISOString()
                : current.slack_channel_created_at
            }
          : current
      );
    }

    setSuccess(slackPayload.message ?? 'Mission confirmée et canal Slack créé.');
    setSlackCreationState('created');
    setIsSlackCardExpanded(true);
    setIsSkillsDirectoryExpanded(false);
    setActionLoading(null);
  }

  const missionTypeColor = missionTypeInfo?.color ?? '#5B6478';

  return (
    <div className="space-y-5">
      {error ? <p className="rounded-2xl border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</p> : null}
      {success ? (
        <p className="flex items-center gap-2 rounded-2xl border border-ok-line bg-ok-soft p-3 text-sm font-semibold text-ok-text">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-ok-bar text-white">
            <Icon name="check" size={13} />
          </span>
          {success}
        </p>
      ) : null}

      {/* Hero card */}
      <article className="rounded-2xl border border-line bg-surface-card p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div
              className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1"
              style={{ background: `${missionTypeColor}1a` }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: missionTypeColor }} />
              <span className="text-[11px] font-extrabold uppercase tracking-[0.04em]" style={{ color: missionTypeColor }}>
                {missionTypeInfo?.name ?? '—'}
              </span>
            </div>
            <h1 className="text-[27px] font-extrabold leading-[1.2] tracking-[-0.02em] text-ink">{mission.title}</h1>
            {mission.description ? (
              <p className="mt-2.5 max-w-[560px] text-[14.5px] leading-[1.6] text-ink-2">{mission.description}</p>
            ) : null}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <MissionStatusBadge status={mission.status} />
            {isAdmin ? (
              <Link
                href={`/admin/missions/${mission.id}/edit`}
                className="inline-flex items-center justify-center gap-1.5 rounded-[11px] border-[1.5px] border-line-field bg-surface-card px-4 py-2 text-sm font-bold text-ink-2 transition hover:bg-[#F4F6FB]"
              >
                Modifier
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-6 border-t border-line-row pt-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-surface-sub">
              <Icon name="location_on" size={17} className="text-ink-2" />
            </span>
            <div>
              <div className="text-[10.5px] font-extrabold uppercase tracking-[0.04em] text-ink-3">Lieu</div>
              <div className="text-[13.5px] font-semibold text-ink-2">{mission.location ?? 'Non défini'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-surface-sub">
              <Icon name="calendar_month" size={17} className="text-ink-2" />
            </span>
            <div>
              <div className="text-[10.5px] font-extrabold uppercase tracking-[0.04em] text-ink-3">Date</div>
              <div className="text-[13.5px] font-semibold text-ink-2">
                {new Date(mission.starts_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-surface-sub">
              <Icon name="schedule" size={17} className="text-ink-2" />
            </span>
            <div>
              <div className="text-[10.5px] font-extrabold uppercase tracking-[0.04em] text-ink-3">Horaires</div>
              <div className="text-[13.5px] font-semibold text-ink-2">
                {new Date(mission.starts_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} –{' '}
                {new Date(mission.ends_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        </div>

        {(mission.mission_required_skills ?? []).length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {(mission.mission_required_skills ?? []).map((requiredSkill) => (
              <span
                key={requiredSkill.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-card py-1.5 pl-2.5 pr-3 text-[12.5px] font-bold text-ink-2"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: getSkillDotColor(requiredSkill.skill_id ? skillColorById[requiredSkill.skill_id] : null) }}
                />
                {formatMissionRequirementLabel(requiredSkill.skill?.name, requiredSkill.quantity)}
              </span>
            ))}
          </div>
        ) : null}

        {profile?.role === 'benevole' ? (
          <div className="mt-4 flex flex-col items-start gap-3">
            <ProposalButton missionId={mission.id} volunteerId={profile.id} disabled={false} missionStatus={mission.status} currentResponse={myProposal?.response ?? null} />
            {myProposal ? <StatusBadge status={myProposal.status} /> : null}
            {!myProposal ? <p className="text-xs text-ink-2">Aucune réponse enregistrée pour cette mission.</p> : null}
          </div>
        ) : null}
      </article>

      {canManageMission ? (
        <section className="rounded-2xl border border-line bg-surface-card p-6 shadow-card">
          <button
            type="button"
            onClick={() => setIsAvailabilityExpanded((current) => !current)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <div>
              <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-ink">Disponibilité des bénévoles</h2>
              <p className="mt-1 text-[13px] text-ink-3">{proposalsTableRows.length} bénévoles sollicités</p>
            </div>
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-sub text-ink-2">
              <Icon name="expand_more" size={18} className={`transition-transform ${isAvailabilityExpanded ? 'rotate-180' : ''}`} />
            </span>
          </button>

          {isAvailabilityExpanded ? (
            <div className="mt-4">
              <div className="mb-4 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => setAvailabilityStatusFilter('all')}
                  className={`flex-1 min-w-[170px] rounded-[14px] border px-4 py-3 text-left transition ${
                    availabilityStatusFilter === 'all' ? 'border-line-field bg-surface-sub' : 'border-line bg-surface-card hover:bg-surface-sub'
                  }`}
                >
                  <span className="block text-[22px] font-extrabold leading-none text-ink">{proposalsTableRows.length}</span>
                  <span className="mt-1 block text-[12.5px] font-bold text-ink-2">Tous statuts</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAvailabilityStatusFilter('available')}
                  className={`flex-1 min-w-[170px] rounded-[14px] border px-4 py-3 text-left transition ${
                    availabilityStatusFilter === 'available' ? 'border-ok-line bg-ok-soft' : 'border-ok-line/60 bg-ok-soft/40 hover:bg-ok-soft'
                  }`}
                >
                  <span className="block text-[22px] font-extrabold leading-none text-ok-bar">{proposalsByStatus.available}</span>
                  <span className="mt-1 block text-[12.5px] font-bold text-ok-text">Disponibles</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAvailabilityStatusFilter('unavailable')}
                  className={`flex-1 min-w-[170px] rounded-[14px] border px-4 py-3 text-left transition ${
                    availabilityStatusFilter === 'unavailable' ? 'border-bad/40 bg-bad-soft' : 'border-bad/20 bg-bad-soft/40 hover:bg-bad-soft'
                  }`}
                >
                  <span className="block text-[22px] font-extrabold leading-none text-bad">{proposalsByStatus.unavailable}</span>
                  <span className="mt-1 block text-[12.5px] font-bold text-bad">Indisponibles</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAvailabilityStatusFilter('no_response')}
                  className={`flex-1 min-w-[170px] rounded-[14px] border px-4 py-3 text-left transition ${
                    availabilityStatusFilter === 'no_response' ? 'border-line-field bg-surface-sub' : 'border-line bg-surface-card hover:bg-surface-sub'
                  }`}
                >
                  <span className="block text-[22px] font-extrabold leading-none text-ink-2">{proposalsByStatus.no_response}</span>
                  <span className="mt-1 block text-[12.5px] font-bold text-ink-2">Sans réponse</span>
                </button>
              </div>

              <input
                type="search"
                value={availabilitySearchQuery}
                onChange={(event) => setAvailabilitySearchQuery(event.target.value)}
                placeholder="Rechercher un bénévole ou une compétence"
                className="mb-3.5 w-full rounded-full border border-line-field bg-surface-sub px-4 py-2.5 text-[13.5px] text-ink-2 outline-none focus:border-accent"
              />

              <div className="flex flex-col gap-2">
                {filteredProposalsTableRows.length === 0 ? (
                  <p className="py-4 text-center text-[13px] text-ink-3">Aucun bénévole ne correspond aux filtres sélectionnés.</p>
                ) : (
                  filteredProposalsTableRows.map((row) => (
                    <div
                      key={row.id}
                      className={`flex flex-wrap items-center gap-3 rounded-[14px] border border-line-row p-2.5 ${
                        row.response === 'available' ? 'bg-ok-soft/30' : row.response === 'unavailable' ? 'bg-bad-soft/30' : 'bg-transparent'
                      }`}
                    >
                      <div className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-full bg-surface-sub text-[12.5px] font-extrabold text-ink-2">
                        {row.avatarUrl ? (
                          <img src={row.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                        ) : (
                          row.initials
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-bold text-ink">{row.volunteerLabel}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {row.updatedByAdmin ? (
                            <span className="inline-flex rounded-full border border-[#E3D6EF] bg-acsso-soft px-2 py-0.5 text-[10.5px] font-semibold text-acsso-text">
                              Modifié par admin
                            </span>
                          ) : null}
                          {row.volunteerSkills.slice(0, 4).map((skill) => (
                            <SkillBadge key={`${row.id}-${skill.id}`} name={skill.name} color={skillColorById[skill.id]} />
                          ))}
                        </div>
                      </div>
                      <span
                        className={`flex-shrink-0 rounded-full px-3 py-1 text-[12px] font-extrabold ${
                          row.response === 'available'
                            ? 'bg-ok-soft text-ok-text'
                            : row.response === 'unavailable'
                              ? 'bg-bad-soft text-bad'
                              : 'bg-surface-sub text-ink-2'
                        }`}
                      >
                        {row.responseLabel}
                      </span>
                      {isAdmin ? (
                        <div className="flex flex-shrink-0 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setVolunteerResponseByAdmin(row.volunteerId, 'available')}
                            disabled={actionLoading === `admin-response-${row.volunteerId}` || row.response === 'available'}
                            className="rounded-[8px] border border-ok-line bg-surface-card px-2.5 py-1.5 text-[11.5px] font-bold text-ok-text hover:bg-ok-soft disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Disponible
                          </button>
                          <button
                            type="button"
                            onClick={() => setVolunteerResponseByAdmin(row.volunteerId, 'unavailable')}
                            disabled={actionLoading === `admin-response-${row.volunteerId}` || row.response === 'unavailable'}
                            className="rounded-[8px] border border-bad/30 bg-surface-card px-2.5 py-1.5 text-[11.5px] font-bold text-bad hover:bg-bad-soft disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Indisponible
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {canManageMission && showSelection ? (
        <section className="rounded-2xl border border-line bg-surface-card p-6 shadow-card">
          <button
            type="button"
            onClick={() => setIsSkillsDirectoryExpanded((current) => !current)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <div>
              <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-ink">Sélection de l&apos;équipage</h2>
              <p className="mt-1 text-[13px] text-ink-3">Sélectionnez les bénévoles disponibles par compétence requise.</p>
            </div>
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-sub text-ink-2">
              <Icon name="expand_more" size={18} className={`transition-transform ${isSkillsDirectoryExpanded ? 'rotate-180' : ''}`} />
            </span>
          </button>

          {isSkillsDirectoryExpanded ? (
            <div className="mt-4 flex flex-col gap-3.5">
              {requiredSkillsVolunteerDirectory.length === 0 ? (
                <p className="text-sm text-ink-2">Aucune compétence requise sur cette mission.</p>
              ) : (
                requiredSkillsVolunteerDirectory.map((skillGroup) => {
                  const filledCount = skillGroup.volunteers.filter((volunteer) => pendingAssignments.get(volunteer.id) === skillGroup.requiredSkillId).length;
                  const met = filledCount >= skillGroup.requiredCount;
                  return (
                    <div key={skillGroup.requiredSkillId} className="rounded-2xl border border-line-row p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="h-[7px] w-[7px] rounded-full" style={{ background: getSkillDotColor(skillGroup.skillId ? skillColorById[skillGroup.skillId] : null) }} />
                          <h3 className="text-[14.5px] font-extrabold text-ink">{skillGroup.requiredSkillName}</h3>
                        </div>
                        {skillGroup.requiredCount > 0 ? (
                          <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${met ? 'bg-ok-soft text-ok-text' : 'bg-surface-sub text-ink-2'}`}>
                            {filledCount}/{skillGroup.requiredCount}
                          </span>
                        ) : null}
                      </div>
                      {skillGroup.volunteers.length === 0 ? (
                        <p className="mt-2 text-sm text-ink-2">Aucun bénévole correspondant pour le moment.</p>
                      ) : (
                        <div className="mt-3.5 flex flex-wrap gap-4">
                          {skillGroup.volunteers.map((volunteer) => {
                            const selectedSkillId = pendingAssignments.get(volunteer.id);
                            const isSelectedOnThisSkill = selectedSkillId === skillGroup.requiredSkillId;
                            const isSelectedElsewhere = Boolean(selectedSkillId) && selectedSkillId !== skillGroup.requiredSkillId;
                            const canToggle = !missionBlocksSelection && !isSelectedElsewhere;

                            return (
                              <div key={`${skillGroup.requiredSkillId}-${volunteer.id}`} className="group/volunteer relative w-[76px] text-center">
                                <button
                                  type="button"
                                  onClick={() => toggleSelection(volunteer.id, skillGroup.requiredSkillId)}
                                  disabled={!canToggle}
                                  className="w-full cursor-pointer border-none bg-transparent p-0 disabled:cursor-not-allowed"
                                  style={{ opacity: isSelectedElsewhere ? 0.4 : 1 }}
                                >
                                  <div
                                    className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 text-[13px] font-extrabold"
                                    style={{
                                      background: isSelectedOnThisSkill ? '#E9F7EF' : '#F2F5FA',
                                      color: isSelectedOnThisSkill ? '#12805A' : '#5B6478',
                                      borderColor: isSelectedOnThisSkill ? '#BDE7CE' : 'transparent'
                                    }}
                                  >
                                    {volunteer.avatarUrl ? (
                                      <img src={volunteer.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                                    ) : (
                                      volunteer.initials
                                    )}
                                  </div>
                                  <div className="mt-1.5 text-[11.5px] font-semibold leading-[1.25] text-ink-2">{volunteer.fullName}</div>
                                </button>
                                <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-56 -translate-x-1/2 rounded-md border border-line bg-surface-card p-2 text-left text-xs text-ink-2 shadow-lift group-hover/volunteer:block">
                                  <p className="font-semibold text-ink">Compétences</p>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {(proposals.find((p) => p.volunteer_id === volunteer.id)?.volunteer?.profile_skills ?? []).map((ps) => {
                                      const s = Array.isArray(ps.skill) ? ps.skill[0] : ps.skill;
                                      if (!s) return null;
                                      return (
                                        <span key={`${volunteer.id}-${s.id}`} className="inline-flex rounded-full bg-surface-sub px-2 py-0.5 text-[10px] font-medium text-ink-2">
                                          {s.name}
                                        </span>
                                      );
                                    })}
                                  </div>
                                  <p className="mt-2">Dernière activité : {formatElapsedSince(volunteerActivityStats[volunteer.id]?.lastActivityAt ?? null)}</p>
                                  <p>Activités (30j) : {volunteerActivityStats[volunteer.id]?.monthlyCount ?? 0}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {mission.status === 'confirmed' && recapEditing ? (
                <div className="flex justify-end">
                  <Button variant="primary" onClick={() => setRecapEditing(false)}>
                    Terminer la modification
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {canManageMission && showSelection ? (
        <MissionMaterielAssignmentPicker
          requirements={requiredMateriels}
          candidateContainers={candidateContainers}
          onChange={() => void loadMaterielAssignments(mission.id)}
        />
      ) : null}

      {canManageMission && showRecap ? (
        <section className="rounded-2xl border border-line bg-surface-card p-6 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-ink">Équipage &amp; matériel</h2>
              <p className="mt-1 text-[13px] text-ink-3">Événement confirmé — récapitulatif de la composition.</p>
            </div>
            <button
              type="button"
              onClick={() => setRecapEditing(true)}
              className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-[11px] border-[1.5px] border-line-field bg-surface-card px-4 py-2 text-sm font-bold text-ink-2 transition hover:bg-[#F4F6FB]"
            >
              Modifier
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-3.5">
            {requiredSkillsVolunteerDirectory.map((skillGroup) => {
              const members = skillGroup.volunteers.filter((volunteer) => pendingAssignments.get(volunteer.id) === skillGroup.requiredSkillId);
              return (
                <div key={skillGroup.requiredSkillId} className="rounded-2xl border border-line-row p-4">
                  <div className="flex items-center gap-2">
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: getSkillDotColor(skillGroup.skillId ? skillColorById[skillGroup.skillId] : null) }} />
                    <h3 className="text-[14.5px] font-extrabold text-ink">{skillGroup.requiredSkillName}</h3>
                  </div>
                  {members.length === 0 ? (
                    <p className="mt-2 text-[12.5px] text-ink-3">Aucun bénévole affecté.</p>
                  ) : (
                    <div className="mt-3.5 flex flex-wrap gap-4">
                      {members.map((volunteer) => (
                        <div key={volunteer.id} className="w-[76px] text-center">
                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-ok-line bg-ok-soft text-[13px] font-extrabold text-ok-text">
                            {volunteer.avatarUrl ? (
                              <img src={volunteer.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                            ) : (
                              volunteer.initials
                            )}
                          </div>
                          <div className="mt-1.5 text-[11.5px] font-semibold leading-[1.25] text-ink-2">{volunteer.fullName}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {requiredMateriels.map((requirement) => (
              <div key={requirement.id} className="rounded-2xl border border-line-row p-4">
                <div className="flex items-center gap-2">
                  <Icon name="inventory_2" size={18} className="text-ink-3" />
                  <h3 className="text-[14.5px] font-extrabold text-ink">{requirement.category?.name ?? 'Matériel'}</h3>
                </div>
                {(requirement.assignments ?? []).length === 0 ? (
                  <p className="mt-2 text-[12.5px] text-ink-3">Aucun matériel affecté.</p>
                ) : (
                  <div className="mt-3.5 flex flex-wrap gap-2">
                    {(requirement.assignments ?? []).map((assignment) => (
                      <span
                        key={assignment.id}
                        className="rounded-full border border-ok-line bg-ok-soft px-3.5 py-2 text-[12.5px] font-bold text-ok-text"
                      >
                        {assignment.materiel_type?.name ?? 'Contenant'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {canManageMission ? (
        <section className="rounded-2xl border border-line bg-surface-card p-6 shadow-card">
          <button
            type="button"
            onClick={() => setIsSlackCardExpanded((current) => !current)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-surface-sub">
                <Icon name="chat" size={16} className="text-ink-2" />
              </span>
              <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-ink">Slack</h2>
              <span
                className={`rounded-full px-2.5 py-1 text-[11.5px] font-extrabold ${
                  isSlackChannelCreated ? 'bg-ok-soft text-ok-text' : 'bg-surface-sub text-ink-2'
                }`}
              >
                {isSlackChannelCreated ? 'Canal créé' : 'Non créé'}
              </span>
            </div>
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-sub text-ink-2">
              <Icon name="expand_more" size={18} className={`transition-transform ${isSlackCardExpanded ? 'rotate-180' : ''}`} />
            </span>
          </button>

          {isSlackCardExpanded ? (
            <div className="mt-4 flex flex-col gap-3.5">
              <div>
                <label className="mb-1.5 block text-[12.5px] font-bold text-ink-2">Nom du canal proposé</label>
                <input
                  type="text"
                  value={slackChannelNameDraft}
                  onChange={(event) => setSlackChannelNameDraft(event.target.value)}
                  disabled={isSlackChannelCreated}
                  title={mission.slack_channel_id ? `${mission.slack_channel_name} (${mission.slack_channel_id})` : undefined}
                  className="w-full rounded-[10px] border border-line-field px-3.5 py-2.5 text-[13.5px] text-ink disabled:cursor-not-allowed disabled:bg-surface-sub disabled:text-ink-3"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12.5px] font-bold text-ink-2">Message d&apos;accueil</label>
                <textarea
                  rows={3}
                  value={slackMessageDraft}
                  onChange={(event) => setSlackMessageDraft(event.target.value)}
                  disabled={isSlackChannelCreated}
                  className="w-full resize-y rounded-[10px] border border-line-field px-3.5 py-2.5 text-[13.5px] text-ink disabled:cursor-not-allowed disabled:bg-surface-sub disabled:text-ink-3"
                />
              </div>

              {!isSlackChannelCreated ? (
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    onClick={() => void confirmAndCreateSlackChannel()}
                    disabled={actionLoading === 'confirm-and-slack' || missionBlocksSelection}
                  >
                    {actionLoading === 'confirm-and-slack' ? 'Création en cours…' : 'Confirmer et créer le canal Slack'}
                  </Button>
                </div>
              ) : null}

              {isSlackChannelCreated ? (
                <div className="border-t border-line-row pt-3.5">
                  <label className="mb-1.5 block text-[12.5px] font-bold text-ink-2">Message libre</label>
                  <textarea
                    rows={2}
                    value={slackFreeMessageDraft}
                    onChange={(event) => setSlackFreeMessageDraft(event.target.value)}
                    placeholder="Tapez votre message Slack…"
                    className="w-full rounded-[10px] border border-line-field px-3.5 py-2.5 text-[13.5px] text-ink"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={sendSlackFreeMessage}
                      disabled={!mission.slack_channel_id || actionLoading === 'send-slack-message' || !slackFreeMessageDraft.trim()}
                      className="rounded-[11px] border border-line-field px-4 py-2 text-[12.5px] font-bold text-ink-2 hover:bg-surface-sub disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {actionLoading === 'send-slack-message' ? 'Envoi en cours...' : 'Envoyer'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {canManageMission ? (
        <section className="rounded-2xl border border-line bg-surface-card p-6 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-ink">Activité des bénévoles</h2>
            <button
              type="button"
              aria-expanded={isActivityExpanded}
              aria-controls="mission-activity-content"
              aria-label={isActivityExpanded ? "Masquer l'activité des bénévoles" : "Afficher l'activité des bénévoles"}
              onClick={() => setIsActivityExpanded((current) => !current)}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-sub text-ink-2"
            >
              <Icon name="expand_more" size={18} className={`transition-transform ${isActivityExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <p className="mt-1 text-sm text-ink-2">Heures cumulées sur l&apos;année roulante pour les bénévoles disponibles.</p>

          {isActivityExpanded ? (
            <div id="mission-activity-content" className="mt-4">
              <MissionActivityPanel acts={activityActs} error={activityError} />
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-2xl border border-line bg-surface-card p-6 shadow-card">
        <button
          type="button"
          onClick={() => setIsHistoryExpanded((current) => !current)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div>
            <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-ink">Historique</h2>
            <p className="mt-1 text-[13px] text-ink-3">Événements récents, du plus récent au plus ancien.</p>
          </div>
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-sub text-ink-2">
            <Icon name="expand_more" size={18} className={`transition-transform ${isHistoryExpanded ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {isHistoryExpanded ? (
          <div className="mt-4">
            <label className="mb-3.5 block">
              <span className="sr-only">Rechercher dans l&apos;historique</span>
              <input
                type="search"
                value={activitySearch}
                onChange={(event) => setActivitySearch(event.target.value)}
                placeholder="Rechercher dans l'historique"
                className="w-full rounded-full border border-line-field bg-surface-card px-4 py-2.5 text-[13.5px] text-ink-2 outline-none focus:border-accent"
              />
            </label>
            <div className="mb-4.5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedActivityType('all')}
                className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-bold transition ${
                  selectedActivityType === 'all' ? 'border-brand bg-brand text-white' : 'border-line-field bg-surface-card text-ink-2 hover:bg-surface-sub'
                }`}
              >
                Toutes {activityLogs.length}
              </button>
              {Object.entries(ACTIVITY_TYPE_LABELS).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedActivityType(type as ActivityLog['action_type'])}
                  className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-bold transition ${
                    selectedActivityType === type
                      ? 'border-brand bg-brand text-white'
                      : 'border-line-field bg-surface-card text-ink-2 hover:bg-surface-sub'
                  }`}
                >
                  {label} {activityTypeCounts[type as ActivityLog['action_type']]}
                </button>
              ))}
            </div>

            {activityLogGroups.length === 0 ? (
              <p className="text-[13px] text-ink-3">
                {activityLogs.length === 0 ? 'Aucun historique disponible pour cette mission.' : 'Aucun résultat avec ces filtres.'}
              </p>
            ) : (
              <div className="relative pl-[22px]">
                <div className="absolute bottom-1.5 left-[5px] top-1.5 w-[2px] bg-surface" />
                {activityLogGroups.map((group) => (
                  <div key={group.label} className="mb-5">
                    <div className="-ml-[22px] mb-2.5 pl-[22px] text-[11px] font-extrabold uppercase tracking-[0.05em] text-ink-3">{group.label}</div>
                    {group.events.map((log) => (
                      <div key={log.id} className="relative mb-3">
                        <span className="absolute -left-[22px] top-[5px] h-2.5 w-2.5 rounded-full border-2 border-surface-card bg-brand" />
                        <div className="text-[13.5px] font-bold text-ink">{log.description}</div>
                        <div className="mt-0.5 text-xs text-ink-3">
                          {new Date(log.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                          {log.actor?.full_name ?? log.actor?.email ?? 'Système'}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
