'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';

type VolunteerProfile = Pick<Profile, 'id' | 'full_name' | 'email' | 'phone' | 'sector' | 'role' | 'created_at'>;

type VolunteersPageClientProps = {
  created: boolean;
  edited: boolean;
};

export function VolunteersPageClient({ created, edited }: VolunteersPageClientProps) {
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
        .select('id,full_name,email,phone,role,sector,created_at')
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
        .select('id,full_name,email,phone,sector,role,created_at')
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
    return <p className="text-sm text-slate-600">Chargement des bénévoles...</p>;
  }

  if (!profile) {
    return <p className="text-sm text-red-600">{error ?? 'Accès refusé.'}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Gestion des bénévoles</h1>
            <p className="mt-1 text-sm text-slate-600">{volunteerCountLabel} enregistré(s).</p>
          </div>
          <Link
            href="/admin/volunteers/create"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Ajouter un bénévole
          </Link>
        </div>
      </div>

      {created ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Le bénévole a été ajouté avec succès.
        </div>
      ) : null}

      {edited ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Le bénévole a été modifié avec succès.
        </div>
      ) : null}

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {volunteers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          Aucun bénévole enregistré pour le moment.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-4 py-2 font-medium">Nom</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Téléphone</th>
                <th className="px-4 py-2 font-medium">Secteur</th>
                <th className="px-4 py-2 font-medium">Créé le</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {volunteers.map((volunteer) => (
                <tr key={volunteer.id}>
                  <td className="px-4 py-2 text-slate-900">{volunteer.full_name ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-700">{volunteer.email}</td>
                  <td className="px-4 py-2 text-slate-700">{volunteer.phone ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-700">{volunteer.sector ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-700">{new Date(volunteer.created_at).toLocaleString('fr-FR')}</td>
                  <td className="px-4 py-2 text-slate-700">
                    <Link href={`/admin/volunteers/${volunteer.id}/edit`} className="text-slate-900 underline hover:text-slate-700">
                      Modifier
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
