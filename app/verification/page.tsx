'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { getMissionVerificationStatusBadgeClass, MISSION_VERIFICATION_STATUS_LABELS } from '@/lib/missions';
import { MissionVerificationSummary } from '@/lib/types';

export default function VerificationListPage() {
  const [missions, setMissions] = useState<MissionVerificationSummary[]>([]);
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

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? '';

      const res = await fetch('/api/verification/missions', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? 'Impossible de charger les missions à vérifier.');
        setLoading(false);
        return;
      }

      const { missions: data } = (await res.json()) as { missions: MissionVerificationSummary[] };
      setMissions(data);
      setLoading(false);
    }

    void loadData();
  }, [router]);

  if (loading) {
    return <p className="text-sm text-slate-600">Chargement des missions à vérifier...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Vérification du matériel</h1>
        <p className="text-sm text-slate-600">
          Matériel engagé sur vos missions confirmées. Lancez la vérification pour pointer chaque item.
        </p>
      </div>

      {missions.length === 0 ? (
        <p className="text-sm text-slate-600">Aucune mission confirmée avec du matériel à vérifier pour le moment.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {missions.map((mission) => (
            <li key={mission.mission_id} className="rounded-lg border border-slate-200 bg-white p-4">
              <Link href={`/verification/${mission.mission_id}`} className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-slate-900">{mission.title}</span>
                  <span className="text-xs text-slate-500">
                    {new Date(mission.starts_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
                    {mission.location ? ` · ${mission.location}` : ''}
                  </span>
                  {mission.total_items > 0 ? (
                    <span className="text-xs text-slate-500">
                      {mission.checked_items} / {mission.total_items} items vérifiés
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Aucun matériel requis défini sur cette mission.</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded border px-2 py-1 text-xs font-medium uppercase ${getMissionVerificationStatusBadgeClass(mission.status)}`}
                  >
                    {MISSION_VERIFICATION_STATUS_LABELS[mission.status]}
                  </span>
                  <span aria-hidden="true" className="text-xl text-slate-400">
                    →
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
