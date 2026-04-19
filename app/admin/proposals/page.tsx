'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProposalList, ProposalListItem } from '@/components/missions/proposal-list';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';

export default function AdminProposalsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [proposals, setProposals] = useState<ProposalListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const router = useRouter();

  useEffect(() => {
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

      if (!['admin', 'responsable'].includes(profileData.role)) {
        setError('Accès réservé aux responsables.');
        setLoading(false);
        return;
      }

      setProfile(profileData);

      const { data: proposalData, error: proposalsError } = await supabase
        .from('mission_proposals')
        .select(`
          id,
          mission_id,
          status,
          created_at,
          mission:missions(id,title,starts_at,location,sector,status),
          volunteer:profiles!mission_proposals_volunteer_id_fkey(id,full_name,email)
        `)
        .order('created_at', { ascending: false });

      if (proposalsError) {
        setError(proposalsError.message);
        setLoading(false);
        return;
      }

      const mapped: ProposalListItem[] = (proposalData ?? []).map((proposal) => ({
        ...proposal,
        mission: Array.isArray(proposal.mission) ? proposal.mission[0] ?? null : proposal.mission,
        volunteer: Array.isArray(proposal.volunteer) ? proposal.volunteer[0] ?? null : proposal.volunteer
      }));

      setProposals(mapped);
      setLoading(false);
    }

    void loadData();
  }, [router]);

  const sectors = useMemo(
    () =>
      Array.from(
        new Set(proposals.map((proposal) => proposal.mission?.sector).filter((sector): sector is string => Boolean(sector)))
      ).sort(),
    [proposals]
  );

  const filteredProposals = useMemo(
    () =>
      proposals.filter((proposal) => {
        if (!proposal.mission) {
          return false;
        }

        if (selectedSector !== 'all' && proposal.mission.sector !== selectedSector) {
          return false;
        }

        const missionDate = proposal.mission.starts_at.slice(0, 10);

        if (dateFrom && missionDate < dateFrom) {
          return false;
        }

        if (dateTo && missionDate > dateTo) {
          return false;
        }

        return true;
      }),
    [proposals, selectedSector, dateFrom, dateTo]
  );

  if (loading) {
    return <p className="text-sm text-slate-600">Chargement des propositions...</p>;
  }

  if (!profile) {
    return <p className="text-sm text-red-600">{error ?? 'Accès refusé.'}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h1 className="text-xl font-semibold text-slate-900">Validation des propositions</h1>
        <p className="mt-1 text-sm text-slate-600">Acceptez ou refusez les bénévoles qui se proposent sur vos missions.</p>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Filtres</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-sm text-slate-700">
            Secteur
            <select
              value={selectedSector}
              onChange={(event) => setSelectedSector(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="all">Tous les secteurs</option>
              {sectors.map((sector) => (
                <option key={sector} value={sector}>
                  {sector}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700">
            Date début min
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="text-sm text-slate-700">
            Date début max
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </section>

      {proposals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          Aucune proposition reçue sur vos missions.
        </div>
      ) : filteredProposals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          Aucun résultat avec les filtres actuels.
        </div>
      ) : (
        <ProposalList proposals={filteredProposals} managerId={profile.id} />
      )}
    </div>
  );
}
