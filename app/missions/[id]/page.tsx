'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { Mission, MissionProposal, MissionProposalResponse, Profile } from '@/lib/types';

type ProposalWithVolunteer = MissionProposal & {
  volunteer: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
};

const responseLabels: Record<MissionProposalResponse, string> = {
  no_response: 'Sans réponse',
  available: 'Disponible',
  unavailable: 'Indisponible',
  maybe: 'Peut-être'
};

export default function MissionDetailPage() {
  const params = useParams<{ id: string }>();
  const missionId = params.id;
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const [proposals, setProposals] = useState<ProposalWithVolunteer[]>([]);
  const [volunteers, setVolunteers] = useState<Pick<Profile, 'id' | 'full_name' | 'email'>[]>([]);
  const [selectedVolunteerIds, setSelectedVolunteerIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

    const { data: proposalData } = await supabase
      .from('mission_proposals')
      .select('id,mission_id,volunteer_id,proposed_by,response,responded_at,created_at,volunteer:profiles!mission_proposals_volunteer_id_fkey(id,full_name,email)')
      .eq('mission_id', missionId)
      .order('created_at', { ascending: true });

    const mappedProposals: ProposalWithVolunteer[] = (proposalData ?? []).map((proposal) => ({
      ...proposal,
      volunteer: Array.isArray(proposal.volunteer) ? proposal.volunteer[0] ?? null : proposal.volunteer
    }));

    setProposals(mappedProposals);

    if (profileData.role === 'responsable' || profileData.role === 'admin') {
      const { data: volunteerData } = await supabase
        .from('profiles')
        .select('id,full_name,email')
        .eq('role', 'benevole')
        .order('full_name', { ascending: true });

      setVolunteers(volunteerData ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId, router]);

  function toggleVolunteer(volunteerId: string) {
    setSelectedVolunteerIds((current) =>
      current.includes(volunteerId) ? current.filter((id) => id !== volunteerId) : [...current, volunteerId]
    );
  }

  async function handleProposeMission() {
    if (!profile || !mission || selectedVolunteerIds.length === 0) {
      return;
    }

    setSaving(true);
    setError(null);

    const payload = selectedVolunteerIds.map((volunteerId) => ({
      mission_id: mission.id,
      volunteer_id: volunteerId,
      proposed_by: profile.id,
      response: 'no_response' as const
    }));

    const { error: insertError } = await supabase.from('mission_proposals').upsert(payload, {
      onConflict: 'mission_id,volunteer_id',
      ignoreDuplicates: false
    });

    if (insertError) {
      setError(insertError.message);
    } else {
      setSelectedVolunteerIds([]);
      await loadData();
    }

    setSaving(false);
  }

  async function handleVolunteerResponse(response: MissionProposalResponse) {
    if (!myProposal) {
      return;
    }

    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('mission_proposals')
      .update({
        response,
        responded_at: response === 'no_response' ? null : new Date().toISOString()
      })
      .eq('id', myProposal.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      await loadData();
    }

    setSaving(false);
  }

  if (loading) {
    return <p className="text-sm text-slate-600">Chargement du détail mission...</p>;
  }

  if (error && !mission) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/missions" className="text-sm text-slate-700 underline">
          Retour à la liste
        </Link>
      </div>
    );
  }

  if (!mission) {
    return null;
  }

  const canManageProposals = profile?.role === 'admin' || (profile?.role === 'responsable' && mission.created_by === profile.id);

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
          <div>
            <dt className="inline font-medium text-slate-700">Bénévoles requis :</dt> {mission.required_volunteers}
          </div>
        </dl>
      </article>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Propositions envoyées</h2>
        <div className="mt-3 space-y-2">
          {proposals.map((proposal) => (
            <div key={proposal.id} className="rounded border border-slate-200 p-3 text-sm text-slate-700">
              <p className="font-medium">{proposal.volunteer?.full_name ?? proposal.volunteer?.email ?? proposal.volunteer_id}</p>
              <p>Réponse : {responseLabels[proposal.response]}</p>
            </div>
          ))}
          {proposals.length === 0 ? <p className="text-sm text-slate-600">Aucune proposition pour le moment.</p> : null}
        </div>
      </section>

      {canManageProposals ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">Proposer cette mission à des bénévoles</h2>
          <p className="mt-1 text-sm text-slate-600">Sélection multiple possible. Les propositions existantes sont conservées.</p>
          <div className="mt-3 space-y-2">
            {volunteers.map((volunteer) => {
              const isAlreadyProposed = proposals.some((proposal) => proposal.volunteer_id === volunteer.id);
              const checked = selectedVolunteerIds.includes(volunteer.id);

              return (
                <label key={volunteer.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isAlreadyProposed}
                    onChange={() => toggleVolunteer(volunteer.id)}
                  />
                  <span>
                    {volunteer.full_name ?? volunteer.email} {isAlreadyProposed ? '(déjà proposé)' : ''}
                  </span>
                </label>
              );
            })}
          </div>
          <button
            type="button"
            disabled={saving || selectedVolunteerIds.length === 0}
            onClick={handleProposeMission}
            className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Envoyer les propositions'}
          </button>
        </section>
      ) : null}

      {profile?.role === 'benevole' ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">Ma réponse</h2>
          {myProposal ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-slate-700">
                Statut actuel : <span className="font-medium">{responseLabels[myProposal.response]}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {(['no_response', 'available', 'unavailable', 'maybe'] as MissionProposalResponse[]).map((responseValue) => (
                  <button
                    key={responseValue}
                    type="button"
                    onClick={() => handleVolunteerResponse(responseValue)}
                    disabled={saving}
                    className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {responseLabels[responseValue]}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">Vous n&apos;avez pas de proposition associée à cette mission.</p>
          )}
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <p className="text-xs text-slate-500">Utilisateur connecté: {profile?.full_name ?? user?.email}</p>
    </div>
  );
}
