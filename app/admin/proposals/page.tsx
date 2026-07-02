'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProposalList, ProposalListItem } from '@/components/missions/proposal-list';
import { AdminBanner, AdminCard, AdminFieldLabel, AdminPageHeader, AdminSectionLabel, adminInputStyle, ghostButtonStyle } from '@/components/admin/ui';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';

export default function AdminProposalsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [proposals, setProposals] = useState<ProposalListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

      if (profileData.role !== 'admin') {
        const { data: canManage } = await supabase.rpc('has_role_behavior', {
          _user_id: authData.user.id,
          _resource_type: 'mission',
          _behavior: 'can_manage',
        });
        if (!canManage) {
          setError('Accès réservé aux responsables.');
          setLoading(false);
          return;
        }
      }

      setProfile(profileData);

      const { data: proposalData, error: proposalsError } = await supabase
        .from('mission_proposals')
        .select(`
          id,
          mission_id,
          status,
          created_at,
          mission:missions(id,title,starts_at,location,status),
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

  const filteredProposals = useMemo(
    () =>
      proposals.filter((proposal) => {
        if (!proposal.mission) {
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
    [proposals, dateFrom, dateTo]
  );

  if (loading) {
    return <p style={{ fontSize: 14, color: '#5B6478' }}>Chargement des propositions…</p>;
  }

  if (!profile) {
    return <p style={{ fontSize: 14, color: '#D14343' }}>{error ?? 'Accès refusé.'}</p>;
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <AdminPageHeader
        title="Validation des propositions"
        subtitle="Acceptez ou refusez les bénévoles qui se proposent sur vos missions."
        actions={
          profile.role === 'admin' ? (
            <>
              <Link href="/admin/volunteers" style={ghostButtonStyle}>Ajouter un bénévole</Link>
              <Link href="/admin/events/create" style={ghostButtonStyle}>Créer un événement</Link>
            </>
          ) : null
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error ? <AdminBanner tone="error">{error}</AdminBanner> : null}

        <AdminCard padding="18px 22px">
          <AdminSectionLabel style={{ marginBottom: 13 }}>Filtres</AdminSectionLabel>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div>
              <AdminFieldLabel htmlFor="proposals-date-from">Date début min</AdminFieldLabel>
              <input id="proposals-date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} style={adminInputStyle} />
            </div>
            <div>
              <AdminFieldLabel htmlFor="proposals-date-to">Date début max</AdminFieldLabel>
              <input id="proposals-date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} style={adminInputStyle} />
            </div>
          </div>
        </AdminCard>

        {proposals.length === 0 ? (
          <div style={{ textAlign: 'center', background: '#fff', border: '1.5px dashed #e2e8f0', borderRadius: 16, padding: '36px 24px', fontSize: 13.5, color: '#94a3b8' }}>
            Aucune proposition reçue sur vos missions.
          </div>
        ) : filteredProposals.length === 0 ? (
          <div style={{ textAlign: 'center', background: '#fff', border: '1.5px dashed #e2e8f0', borderRadius: 16, padding: '36px 24px', fontSize: 13.5, color: '#94a3b8' }}>
            Aucun résultat avec les filtres actuels.
          </div>
        ) : (
          <ProposalList proposals={filteredProposals} managerId={profile.id} />
        )}
      </div>
    </div>
  );
}
