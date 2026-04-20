'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { MissionStatusBadge } from '@/components/missions/mission-status-badge';
import { ProposalButton } from '@/components/missions/proposal-button';
import { StatusBadge } from '@/components/missions/status-badge';
import { supabase } from '@/lib/supabase/client';
import { ActivityLog, MISSION_CATEGORY_LABELS, Mission, MissionAssignment, MissionProposal, MissionRequiredSkill, Profile, ProfileSkill } from '@/lib/types';
import { getProposalResponseLabel } from '@/lib/missions';
import { buildExpandedSkillSet, compareSkillCodes, getSkillLabel, SkillCode } from '@/lib/skills';

type ProposalWithVolunteer = MissionProposal & {
  volunteer: (Pick<Profile, 'id' | 'full_name' | 'email'> & {
    profile_skills?: ProfileSkill[] | null;
  }) | null;
};

type AssignmentWithVolunteer = MissionAssignment & {
  volunteer: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
};

type MissionWithSkills = Mission & {
  mission_required_skills: MissionRequiredSkill[] | null;
};

type ActivityLogWithActor = ActivityLog & {
  actor: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
};

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
  const [selectedVolunteerSkillCode, setSelectedVolunteerSkillCode] = useState<'all' | SkillCode>('all');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const myProposal = useMemo(
    () => proposals.find((proposal) => proposal.volunteer_id === profile?.id) ?? null,
    [profile?.id, proposals]
  );

  const selectedVolunteerIds = useMemo(() => new Set(assignments.map((assignment) => assignment.volunteer_id)), [assignments]);

  const eligibleProposals = useMemo(
    () => proposals.filter((proposal) => proposal.response === 'available'),
    [proposals]
  );

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
        'id,title,description,location,sector,category,starts_at,ends_at,required_volunteers,status,created_by,created_at,mission_required_skills(id,mission_id,skill_id,quantity,created_at,skill:skills(id,name,label))'
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
        'id,mission_id,volunteer_id,proposed_by,response,status,decided_at,decided_by,created_at,volunteer:profiles!mission_proposals_volunteer_id_fkey(id,full_name,email,profile_skills(profile_id,skill_id,created_at,skill:skills(id,name)))'
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

  async function toggleSelection(volunteerId: string) {
    if (!mission || missionBlocksSelection) {
      return;
    }

    setActionLoading(volunteerId);
    setError(null);
    setSuccess(null);

    if (selectedVolunteerIds.has(volunteerId)) {
      const { error: deleteError } = await supabase
        .from('mission_assignments')
        .delete()
        .eq('mission_id', mission.id)
        .eq('volunteer_id', volunteerId);

      if (deleteError) {
        setError(`Impossible de retirer le bénévole : ${deleteError.message}`);
        setActionLoading(null);
        return;
      }

      setSuccess('Bénévole retiré de l\'équipe finale.');
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

      setSuccess('Bénévole ajouté à l\'équipe finale.');
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
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
              {MISSION_CATEGORY_LABELS[mission.category]}
            </span>
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
            <ul className="mt-1 list-inside list-disc">
              {(mission.mission_required_skills ?? []).map((requiredSkill) => (
                <li key={requiredSkill.id}>
                  {(requiredSkill.skill?.name ?? 'Compétence')} ×{requiredSkill.quantity}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {profile?.role === 'benevole' ? (
          <div className="mt-4 flex flex-col items-start gap-3">
            <ProposalButton
              missionId={mission.id}
              volunteerId={profile.id}
              disabled={false}
              missionStatus={mission.status}
              currentResponse={myProposal?.response ?? null}
            />
            {myProposal ? <StatusBadge status={myProposal.status} /> : null}
            {!myProposal ? <p className="text-xs text-slate-600">Aucune réponse enregistrée pour cette mission.</p> : null}
          </div>
        ) : null}
      </article>

      {canManageMission ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Équipe finale</h2>
            <button
              type="button"
              onClick={confirmMission}
              disabled={assignments.length === 0 || mission.status !== 'proposed' || actionLoading === 'confirm-mission'}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionLoading === 'confirm-mission' ? 'Validation...' : 'Confirmer la mission'}
            </button>
          </div>

          <div className="mt-3">
            <label className="text-sm text-slate-700">
              Filtrer les bénévoles par compétence
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

          {missionBlocksSelection ? (
            <p className="mt-3 text-sm text-slate-600">Mission verrouillée : sélection finale indisponible.</p>
          ) : null}

          <div className="mt-3 space-y-2">
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
              <p className="text-sm text-slate-600">Aucune réponse exploitable (oui) pour composer l&apos;équipe.</p>
            ) : filteredEligibleProposals.length === 0 ? (
              <p className="text-sm text-slate-600">Aucun résultat avec ce filtre de compétence.</p>
            ) : null}
          </div>

          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
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
