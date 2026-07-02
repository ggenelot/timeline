'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MissionStatusBadge } from '@/components/missions/mission-status-badge';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';
import { Card, PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type AssignmentMissionRow = {
  id: string;
  assignment_status: 'selected' | 'confirmed' | 'declined' | 'replaced';
  created_at: string;
  mission: {
    id: string;
    title: string;
    starts_at: string;
    location: string | null;
    
    status: 'draft' | 'proposed' | 'closed' | 'confirmed' | 'cancelled';
  } | null;
};

export default function MyMissionsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rows, setRows] = useState<AssignmentMissionRow[]>([]);
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

      setProfile(profileData);

      let assignmentsQuery = supabase
        .from('mission_assignments')
        .select('id,assignment_status,created_at,mission:missions(id,title,starts_at,location,status)')
        .eq('volunteer_id', authData.user.id)
        .order('created_at', { ascending: false });

      if (profileData.role === 'benevole') {
        assignmentsQuery = assignmentsQuery.eq('mission.status', 'proposed');
      }

      const { data, error: assignmentsError } = await assignmentsQuery;

      if (assignmentsError) {
        setError(assignmentsError.message);
        setLoading(false);
        return;
      }

      const mapped: AssignmentMissionRow[] = (data ?? [])
        .map((row) => ({
          ...row,
          mission: Array.isArray(row.mission) ? row.mission[0] ?? null : row.mission
        }))
        .filter((row) => row.mission !== null);

      setRows(mapped);
      setLoading(false);
    }

    void loadData();
  }, [router]);

  if (loading) {
    return <p className="text-sm text-ink-2">Chargement de mes missions retenues...</p>;
  }

  if (!profile) {
    return <p className="text-sm text-bad">{error ?? 'Accès refusé.'}</p>;
  }

  if (profile.role === 'benevole') {
    return <p className="text-sm text-ink-2">Cette page n&apos;est pas disponible pour les comptes bénévoles.</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={`Mes missions (${rows.length})`} subtitle="Missions dans lesquelles vous êtes sélectionné." />

      {error ? <p className="text-sm text-bad">{error}</p> : null}

      <div className="space-y-3">
        {rows.map((row) => (
          <Card as="article" key={row.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-ink">{row.mission?.title ?? 'Mission supprimée'}</h2>
              <Badge tone="neutral" className="uppercase">
                {row.assignment_status}
              </Badge>
            </div>

            <dl className="mt-3 grid gap-1 text-sm text-ink-2 md:grid-cols-2">
              <div>
                <dt className="inline font-medium text-ink">Date / heure :</dt>{' '}
                {row.mission ? new Date(row.mission.starts_at).toLocaleString('fr-FR') : 'N/A'}
              </div>
              <div>
                <dt className="inline font-medium text-ink">Lieu :</dt> {row.mission?.location ?? 'Non défini'}
              </div>
              <div>
              </div>
              <div>
                <dt className="inline font-medium text-ink">Statut mission :</dt>{' '}
                {row.mission ? <MissionStatusBadge status={row.mission.status} /> : 'N/A'}
              </div>
            </dl>

            {row.mission ? (
              <Link href={`/missions/${row.mission.id}`} className="mt-4 inline-flex text-sm font-medium text-brand underline">
                Voir la mission
              </Link>
            ) : null}
          </Card>
        ))}

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-field bg-surface-card p-6 text-sm text-ink-2">
            Aucune mission retenue pour le moment.
          </div>
        ) : null}
      </div>
    </div>
  );
}
