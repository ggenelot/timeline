'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { getMissionVerificationStatusBadgeClass, MISSION_VERIFICATION_STATUS_LABELS } from '@/lib/missions';
import { MissionVerificationSummary } from '@/lib/types';
import { Card, PageHeader } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';

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
    return <p className="text-sm text-ink-2">Chargement des missions à vérifier...</p>;
  }

  if (error) {
    return <p className="text-sm text-bad">{error}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Vérification du matériel"
        subtitle="Matériel engagé sur vos missions confirmées. Lancez la vérification pour pointer chaque item."
      />

      {missions.length === 0 ? (
        <p className="text-sm text-ink-2">Aucune mission confirmée avec du matériel à vérifier pour le moment.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {missions.map((mission) => (
            <Card as="li" hover key={mission.mission_id}>
              <Link href={`/verification/${mission.mission_id}`} className="flex items-center justify-between gap-4 p-4">
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-ink">{mission.title}</span>
                  <span className="text-xs text-ink-3">
                    {new Date(mission.starts_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
                    {mission.location ? ` · ${mission.location}` : ''}
                  </span>
                  {mission.total_items > 0 ? (
                    <span className="text-xs text-ink-3">
                      {mission.checked_items} / {mission.total_items} items vérifiés
                    </span>
                  ) : (
                    <span className="text-xs text-ink-4">Aucun matériel requis défini sur cette mission.</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10.5px] font-bold uppercase ${getMissionVerificationStatusBadgeClass(mission.status)}`}
                  >
                    {MISSION_VERIFICATION_STATUS_LABELS[mission.status]}
                  </span>
                  <Icon name="chevron_right" size={20} className="text-ink-3" />
                </div>
              </Link>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
