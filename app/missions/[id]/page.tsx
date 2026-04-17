'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { ProposalButton } from '@/components/missions/proposal-button';
import { StatusBadge } from '@/components/missions/status-badge';
import { supabase } from '@/lib/supabase/client';
import { Mission, MissionProposal, Profile } from '@/lib/types';

type ProposalWithVolunteer = MissionProposal & {
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const myProposal = useMemo(
    () => proposals.find((proposal) => proposal.volunteer_id === profile?.id) ?? null,
    [profile?.id, proposals]
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
      .select('id,mission_id,volunteer_id,proposed_by,status,decided_at,decided_by,created_at,volunteer:profiles!mission_proposals_volunteer_id_fkey(id,full_name,email)')
      .eq('mission_id', missionId)
      .order('created_at', { ascending: true });

    if (proposalsError) {
      setError(proposalsError.message);
      setLoading(false);
      return;
    }

    const mappedProposals: ProposalWithVolunteer[] = (proposalData ?? []).map((proposal) => ({
      ...proposal,
      volunteer: Array.isArray(proposal.volunteer) ? proposal.volunteer[0] ?? null : proposal.volunteer
    }));

    setProposals(mappedProposals);
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

  const canManageProposals = profile?.role === 'admin' || (profile?.role === 'responsable' && mission.created_by === user?.id);

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
          <div className="mt-4 flex items-center gap-3">
            <ProposalButton
              missionId={mission.id}
              volunteerId={profile.id}
              disabled={Boolean(myProposal)}
            />
            {myProposal ? <StatusBadge status={myProposal.status} /> : null}
          </div>
        ) : null}
      </article>

      {canManageProposals ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">Propositions reçues</h2>
          <div className="mt-3 space-y-2">
            {proposals.map((proposal) => (
              <div key={proposal.id} className="flex items-center justify-between rounded border border-slate-200 p-3 text-sm text-slate-700">
                <p>{proposal.volunteer?.full_name ?? proposal.volunteer?.email ?? proposal.volunteer_id}</p>
                <StatusBadge status={proposal.status} />
              </div>
            ))}
            {proposals.length === 0 ? <p className="text-sm text-slate-600">Aucune proposition pour le moment.</p> : null}
          </div>
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
