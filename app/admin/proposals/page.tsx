'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProposalList, ProposalListItem } from '@/components/missions/proposal-list';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';

export default function AdminProposalsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [proposals, setProposals] = useState<ProposalListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
          mission:missions(id,title,starts_at,location),
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

      <ProposalList proposals={proposals} managerId={profile.id} />
    </div>
  );
}
