'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';
import { PageHeader } from '@/components/ui/card';

type VolunteerProfile = Pick<Profile, 'id' | 'full_name' | 'identifier' | 'created_at'>;

type AdminVolunteersClientProps = {
  created: boolean;
};

export function AdminVolunteersClient({ created }: AdminVolunteersClientProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [volunteers, setVolunteers] = useState<VolunteerProfile[]>([]);
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

      if (profileData.role !== 'admin') {
        setError('Accès réservé aux administrateurs.');
        setLoading(false);
        return;
      }

      setProfile(profileData);

      const { data: volunteersData, error: volunteersError } = await supabase
        .from('profiles')
        .select('id,full_name,identifier,created_at')
        .eq('role', 'benevole')
        .order('created_at', { ascending: false });

      if (volunteersError) {
        setError(volunteersError.message);
        setLoading(false);
        return;
      }

      setVolunteers(volunteersData ?? []);
      setLoading(false);
    }

    void loadData();
  }, [router]);

  const volunteerCountLabel = useMemo(() => {
    const count = volunteers.length;
    if (count <= 1) {
      return `${count} bénévole`;
    }

    return `${count} bénévoles`;
  }, [volunteers]);

  if (loading) {
    return <p className="text-sm text-ink-2">Chargement des bénévoles...</p>;
  }

  if (!profile) {
    return <p className="text-sm text-bad">{error ?? 'Accès refusé.'}</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion des bénévoles"
        subtitle={`${volunteerCountLabel} enregistré(s).`}
        actions={
          <Link
            href="/admin/volunteers/create"
            className="inline-flex items-center justify-center gap-1.5 rounded-[11px] bg-brand px-4 py-2 text-sm font-bold text-white shadow-[0_8px_18px_-6px_rgba(0,45,116,.5)] transition hover:bg-[#013A8F]"
          >
            Ajouter un bénévole
          </Link>
        }
      />

      {created ? (
        <div className="rounded-md border border-ok-line bg-ok-soft p-3 text-sm text-ok-text">
          Le bénévole a été ajouté avec succès.
        </div>
      ) : null}

      {error ? <div className="rounded-md border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div> : null}

      {volunteers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-field bg-surface-card p-6 text-sm text-ink-2">
          Aucun bénévole enregistré pour le moment.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface-card">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-surface-sub text-left text-ink-2">
              <tr>
                <th className="px-4 py-2 font-medium">Nom</th>
                <th className="px-4 py-2 font-medium">Identifiant</th>
                <th className="px-4 py-2 font-medium">Créé le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-row">
              {volunteers.map((volunteer) => (
                <tr key={volunteer.id}>
                  <td className="px-4 py-2 text-ink">{volunteer.full_name ?? '—'}</td>
                  <td className="px-4 py-2 text-ink-2">{volunteer.identifier ?? '—'}</td>
                  <td className="px-4 py-2 text-ink-2">{new Date(volunteer.created_at).toLocaleString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
