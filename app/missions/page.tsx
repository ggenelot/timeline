'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { Mission, Profile } from '@/lib/types';

export default function MissionsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function loadData() {
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

      if (profileData) {
        setProfile(profileData);
      }

      const { data: missionData } = await supabase
        .from('missions')
        .select('id,title,description,location,sector,starts_at,ends_at,required_volunteers,status,created_by,created_at')
        .order('starts_at', { ascending: true });

      setMissions(missionData ?? []);
      setLoading(false);
    }

    void loadData();
  }, [router]);

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

      <div className="space-y-3">
        {missions.map((mission) => (
          <article key={mission.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{mission.title}</h2>
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
                <dt className="inline font-medium text-slate-700">Début :</dt>{' '}
                {new Date(mission.starts_at).toLocaleString('fr-FR')}
              </div>
              <div>
                <dt className="inline font-medium text-slate-700">Fin :</dt> {new Date(mission.ends_at).toLocaleString('fr-FR')}
              </div>
              <div>
                <dt className="inline font-medium text-slate-700">Bénévoles requis :</dt> {mission.required_volunteers}
              </div>
            </dl>
          </article>
        ))}

        {missions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            Aucune mission de démonstration trouvée.
          </div>
        ) : null}
      </div>
    </div>
  );
}
