'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { ProposalButton } from '@/components/missions/proposal-button';
import { StatusBadge } from '@/components/missions/status-badge';
import { supabase } from '@/lib/supabase/client';
import { Mission, MissionAssignment, MissionProposal, Profile } from '@/lib/types';

type ProposalWithVolunteer = MissionProposal & {
  volunteer: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
};

type AssignmentWithVolunteer = MissionAssignment & {
  volunteer: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
};

export default function MissionDetailPage() {
  const params = useParams<{ id: string }>();
  const missionId = params.id;
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const [proposals, setProposals] = useState<ProposalWithVolunteer[]>([]);
  const [assignments, setAssignments] = useState<AssignmentWithVolunteer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const myProposal = useMemo(
    () => proposals.find((proposal) => proposal.volunteer_id === profile?.id) ?? null,
    [profile?.id, proposals]
  );

  const selectedVolunteerIds = useMemo(() => new Set(assignments.map((assignment) => assignment.volunteer_id)), [assignments]);

  const eligibleProposals = useMemo(
    () => proposals.filter((proposal) => proposal.response === 'available' || proposal.response === 'maybe'),
    [proposals]
  );

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
      .select('id,full_name,email,role,sector,created_at')
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
      .select('id,title,description,location,sector,starts_at,ends_at,required_volunteers,status,created_by,created_at')
      .eq('id', missionId)
      .single();

    if (missionError || !missionData) {
      setError('Mission introuvable ou accès refusé.');
      setLoading(false);
      return;
    }

    setMission(missionData);

    const { data: proposalData, error: proposalsError } = await supabase
      .from('mission_proposals')
      .select(
        'id,mission_id,volunteer_id,proposed_by,response,status,decided_at,decided_by,created_at,volunteer:profiles!mission_proposals_volunteer_id_fkey(id,full_name,email)'
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

    const mappedProposals: ProposalWithVolunteer[] = (proposalData ?? []).map((proposal) => ({
      ...proposal,
      volunteer: Array.isArray(proposal.volunteer) ? proposal.volunteer[0] ?? null : proposal.volunteer
    }));

    const mappedAssignments: AssignmentWithVolunteer[] = (assignmentData ?? []).map((assignment) => ({
      ...assignment,
      volunteer: Array.isArray(assignment.volunteer) ? assignment.volunteer[0] ?? null : assignment.volunteer
    }));

    setProposals(mappedProposals);
    setAssignments(mappedAssignments);
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

    if (selectedVolunteerIds.has(volunteerId)) {
      const { error: deleteError } = await supabase
        .from('mission_assignments')
        .delete()
        .eq('mission_id', mission.id)
        .eq('volunteer_id', volunteerId);

      if (deleteError) {
        setError(deleteError.message);
        setActionLoading(null);
        return;
      }
    } else {
      const { error: insertError } = await supabase.from('mission_assignments').insert({
        mission_id: mission.id,
        volunteer_id: volunteerId,
        assignment_status: 'selected'
      });

      if (insertError) {
        setError(insertError.message);
        setActionLoading(null);
        return;
      }
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

    const { error: updateError } = await supabase.from('missions').update({ status: 'confirmed' }).eq('id', mission.id);

    if (updateError) {
      setError(updateError.message);
      setActionLoading(null);
      return;
    }

    setActionLoading(null);
    await loadData();
  }

  return (
    <div className="space-y-6">
      <Link href="/missions" className="text-sm text-slate-700 underline">
        ← Retour aux missions
      </Link>

      <article className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-slate-900">{mission.title}</h1>
          <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium uppercase text-slate-700">{mission.status}</span>
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

          {mission.status === 'cancelled' ? <p className="mt-3 text-sm text-slate-600">Mission annulée : sélection verrouillée.</p> : null}

          <div className="mt-3 space-y-2">
            {eligibleProposals.map((proposal) => {
              const isSelected = selectedVolunteerIds.has(proposal.volunteer_id);
              const isSaving = actionLoading === proposal.volunteer_id;

              return (
                <div key={proposal.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 p-3 text-sm text-slate-700">
                  <div>
                    <p className="font-medium">{proposal.volunteer?.full_name ?? proposal.volunteer?.email ?? proposal.volunteer_id}</p>
                    <p className="text-xs text-slate-500">Réponse: {proposal.response}</p>
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
              <p className="text-sm text-slate-600">Aucune réponse disponible ou peut-être pour constituer l&apos;équipe.</p>
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

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
