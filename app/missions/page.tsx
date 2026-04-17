'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { MissionCard } from '@/components/missions/mission-card';
import { supabase } from '@/lib/supabase/client';
import { Mission, MissionProposal, Profile } from '@/lib/types';

export default function MissionsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [proposals, setProposals] = useState<MissionProposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  async function loadData() {
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
      .order('starts_at', { ascending: true });

    if (missionError) {
      setError(`Erreur chargement missions: ${missionError.message}`);
      setLoading(false);
      return;
    }

    setMissions(missionData ?? []);

    const { data: proposalData } = await supabase
      .from('mission_proposals')
      .select('id,mission_id,volunteer_id,proposed_by,status,decided_at,decided_by,created_at')
      .eq('volunteer_id', authData.user.id);

    setProposals(proposalData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const proposalByMission = useMemo(
    () => new Map(proposals.map((proposal) => [proposal.mission_id, proposal.status])),
    [proposals]
  );

  if (loading) {
    return <p className="text-sm text-slate-600">Chargement des missions...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h1 className="text-xl font-semibold text-slate-900">Missions</h1>
        <p className="mt-1 text-sm text-slate-600">
          Connecté en tant que <span className="font-medium">{profile?.full_name ?? user?.email}</span> ({profile?.role ?? 'profil incomplet'})
        </p>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="space-y-3">
        {missions.map((mission) => (
          <MissionCard
            key={mission.id}
            mission={mission}
            currentUserId={profile?.id ?? ''}
            canPropose={profile?.role === 'benevole'}
            proposalStatus={proposalByMission.get(mission.id) ?? null}
          />
        ))}

        {missions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            Aucune mission disponible avec vos droits actuels.
          </div>
        ) : null}
      </div>
    </div>
  );
}
