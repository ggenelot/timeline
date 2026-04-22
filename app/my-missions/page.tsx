'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MissionStatusBadge } from '@/components/missions/mission-status-badge';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';

type AssignmentMissionRow = {
  id: string;
  assignment_status: 'selected' | 'confirmed' | 'declined' | 'replaced';
  created_at: string;
  mission: {
    id: string;
    title: string;
    starts_at: string;
    location: string | null;
    sector: string | null;
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
        .select('id,full_name,email,phone,role,sector,created_at')
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
        .select('id,assignment_status,created_at,mission:missions(id,title,starts_at,location,sector,status)')
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
    return <p className="text-sm text-slate-600">Chargement de mes missions retenues...</p>;
  }

  if (!profile) {
    return <p className="text-sm text-red-600">{error ?? 'Accès refusé.'}</p>;
  }

  if (profile.role !== 'benevole') {
    return <p className="text-sm text-slate-700">Cette page est réservée aux bénévoles.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h1 className="text-xl font-semibold text-slate-900">Mes missions retenues</h1>
        <p className="mt-1 text-sm text-slate-600">Missions dans lesquelles vous êtes sélectionné.</p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="space-y-3">
        {rows.map((row) => (
          <article key={row.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{row.mission?.title ?? 'Mission supprimée'}</h2>
              <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium uppercase text-slate-700">
                {row.assignment_status}
              </span>
            </div>

            <dl className="mt-3 grid gap-1 text-sm text-slate-600 md:grid-cols-2">
              <div>
                <dt className="inline font-medium text-slate-700">Date / heure :</dt>{' '}
                {row.mission ? new Date(row.mission.starts_at).toLocaleString('fr-FR') : 'N/A'}
              </div>
              <div>
                <dt className="inline font-medium text-slate-700">Lieu :</dt> {row.mission?.location ?? 'Non défini'}
              </div>
              <div>
                <dt className="inline font-medium text-slate-700">Secteur :</dt> {row.mission?.sector ?? 'Non défini'}
              </div>
              <div>
                <dt className="inline font-medium text-slate-700">Statut mission :</dt>{' '}
                {row.mission ? <MissionStatusBadge status={row.mission.status} /> : 'N/A'}
              </div>
            </dl>

            {row.mission ? (
              <Link href={`/missions/${row.mission.id}`} className="mt-4 inline-flex text-sm text-slate-700 underline">
                Voir la mission
              </Link>
            ) : null}
          </article>
        ))}

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            Aucune mission retenue pour le moment.
          </div>
        ) : null}
      </div>
    </div>
  );
}
