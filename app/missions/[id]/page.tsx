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

const adminResponseOptions: Array<{ label: string; value: Exclude<MissionProposalResponse, 'no_response'> }> = [
  { label: 'Disponible', value: 'available' },
  { label: 'Indisponible', value: 'unavailable' }
];

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
  const [allVolunteers, setAllVolunteers] = useState<VolunteerOption[]>([]);
  const [selectedVolunteerSkillCode, setSelectedVolunteerSkillCode] = useState<'all' | SkillCode>('all');
  const [selectedVolunteerIdToAdd, setSelectedVolunteerIdToAdd] = useState('');
  const [selectedResponseToAdd, setSelectedResponseToAdd] = useState<Exclude<MissionProposalResponse, 'no_response'>>('available');
  const [showAvailabilityManagement, setShowAvailabilityManagement] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const myProposal = useMemo(() => proposals.find((proposal) => proposal.volunteer_id === profile?.id) ?? null, [profile?.id, proposals]);

  const selectedVolunteerIds = useMemo(() => new Set(assignments.map((assignment) => assignment.volunteer_id)), [assignments]);

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

  const proposalsByStatus = useMemo(
    () => ({
      available: proposals.filter((proposal) => proposal.response === 'available').length,
      unavailable: proposals.filter((proposal) => proposal.response === 'unavailable').length,
      no_response: proposals.filter((proposal) => proposal.response === 'no_response').length
    }),
    [proposals]
  );

  const proposalsTableRows = useMemo(
    () =>
      proposals.map((proposal) => ({
        id: proposal.id,
        volunteerLabel: proposal.volunteer?.full_name ?? proposal.volunteer?.email ?? proposal.volunteer_id,
        responseLabel: getProposalResponseLabel(proposal.response),
        responseTone:
          proposal.response === 'available'
            ? 'text-emerald-700'
            : proposal.response === 'unavailable'
              ? 'text-rose-700'
              : 'text-slate-600',
        updatedByAdminLabel: proposal.updated_by_admin ? 'Oui' : 'Non'
      })),
    [proposals]
  );

  const availableVolunteersToAdd = useMemo(() => {
    const linkedVolunteerIds = new Set(proposals.map((proposal) => proposal.volunteer_id));
    return allVolunteers.filter((volunteer) => !linkedVolunteerIds.has(volunteer.id));
  }, [allVolunteers, proposals]);

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

    const { data: assignmentData, error: assignmentsError } = await supabase
      .from('mission_assignments')
      .select('id,mission_id,volunteer_id,assignment_status,created_at,volunteer:profiles!mission_assignments_volunteer_id_fkey(id,full_name,email)')
      .eq('mission_id', missionId)
      .order('created_at', { ascending: true });

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

    if (profileData.role === 'admin') {
      await loadAdminVolunteerDirectory(missionId);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId, router]);

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

  async function toggleSelection(volunteerId: string) {
    if (!mission || missionBlocksSelection) {
      return;
    }

    setActionLoading(volunteerId);
    setError(null);
    setSuccess(null);

    if (selectedVolunteerIds.has(volunteerId)) {
      const { error: deleteError } = await supabase.from('mission_assignments').delete().eq('mission_id', mission.id).eq('volunteer_id', volunteerId);

      if (deleteError) {
        setError(`Impossible de retirer le bénévole : ${deleteError.message}`);
        setActionLoading(null);
        return;
      }

      setSuccess("Bénévole retiré de l'équipe finale.");
    } else {
      const { error: insertError } = await supabase.from('mission_assignments').insert({
        mission_id: mission.id,
        volunteer_id: volunteerId,
        assignment_status: 'selected'
      });

      if (insertError) {
        setError(`Impossible de retenir ce bénévole : ${insertError.message}`);
        setActionLoading(null);
        return;
      }

      setSuccess("Bénévole ajouté à l'équipe finale.");
    }

    setActionLoading(null);
    await loadData();
  }

  async function confirmMission() {
    if (!mission || assignments.length === 0 || mission.status !== 'proposed') {
      return;
    }

    setActionLoading('confirm-mission');
    setError(null);
    setSuccess(null);

    const { error: updateError } = await supabase.from('missions').update({ status: 'confirmed' }).eq('id', mission.id);

    if (updateError) {
      setError(`Impossible de confirmer la mission : ${updateError.message}`);
      setActionLoading(null);
      return;
    }

    setSuccess('Mission confirmée.');
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

      <article className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-slate-900">{mission.title}</h1>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{MISSION_CATEGORY_LABELS[mission.category]}</span>
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
            <ul className="mt-1 space-y-1">
              {(mission.mission_required_skills ?? []).map((requiredSkill) => (
                <li key={requiredSkill.id} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
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
      </article>

      {canManageMission ? (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Pilotage des disponibilités bénévoles</h2>
            <button
              type="button"
              onClick={confirmMission}
              disabled={assignments.length === 0 || mission.status !== 'proposed' || actionLoading === 'confirm-mission'}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionLoading === 'confirm-mission' ? 'Validation...' : 'Confirmer la mission'}
            </button>
          </div>

          <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-3">
            <p>Disponibles : <span className="font-semibold text-emerald-700">{proposalsByStatus.available}</span></p>
            <p>Indisponibles : <span className="font-semibold text-rose-700">{proposalsByStatus.unavailable}</span></p>
            <p>Sans réponse : <span className="font-semibold text-slate-700">{proposalsByStatus.no_response}</span></p>
          </div>

          <div className="overflow-hidden rounded border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="w-12 px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Bénévole</th>
                  <th className="px-3 py-2 font-medium">Disponibilité</th>
                  <th className="px-3 py-2 font-medium">Modifié admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {proposalsTableRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-3 text-slate-500">
                      Aucun bénévole lié à cette mission.
                    </td>
                  </tr>
                ) : (
                  proposalsTableRows.map((row, index) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 font-mono text-slate-500">{index + 1}</td>
                      <td className="px-3 py-2">{row.volunteerLabel}</td>
                      <td className={`px-3 py-2 font-medium ${row.responseTone}`}>{row.responseLabel}</td>
                      <td className="px-3 py-2 text-slate-500">{row.updatedByAdminLabel}</td>
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
                  const isSelected = selectedVolunteerIds.has(proposal.volunteer_id);
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
                        {assignment.volunteer?.full_name ?? assignment.volunteer?.email ?? assignment.volunteer_id} · {assignment.assignment_status}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Historique</h2>
        <p className="mt-1 text-sm text-slate-600">Événements récents de la mission, du plus récent au plus ancien.</p>

        {activityLogs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">Aucun historique disponible pour cette mission.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {activityLogs.map((log) => (
              <li key={log.id} className="rounded border border-slate-200 p-3 text-sm text-slate-700">
                <p className="font-medium">{log.description}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(log.created_at).toLocaleString('fr-FR')} · {log.actor?.full_name ?? log.actor?.email ?? 'Système'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
