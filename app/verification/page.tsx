'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { MISSION_VERIFICATION_MATERIEL_STATUS_LABELS, MISSION_VERIFICATION_MATERIEL_STATUS_TONE, getMissionVerificationMaterielDotClass } from '@/lib/missions';
import { MissionVerificationSummary } from '@/lib/types';
import { Card, PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/cn';

function formatTimeRange(startsAt: string, endsAt: string) {
  const start = new Date(startsAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const end = new Date(endsAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${start} – ${end}`;
}

function formatDuration(startsAt: string, endsAt: string) {
  const minutes = Math.max(0, Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h${String(remaining).padStart(2, '0')}` : `${hours}h`;
}

function ArrowButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      onClick={(event) => event.stopPropagation()}
      aria-label="Lancer la vérification"
      className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-for"
    >
      <Icon name="arrow_forward" size={18} />
    </Link>
  );
}

export default function VerificationListPage() {
  const [missions, setMissions] = useState<MissionVerificationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMissionId, setOpenMissionId] = useState<string | null>(null);
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
      setOpenMissionId(data[0]?.mission_id ?? null);
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
      <PageHeader title="Mes missions" subtitle="Dépliez une mission pour voir son matériel et lancer une vérification." />

      {missions.length === 0 ? (
        <Card>
          <EmptyState
            tone="ok"
            icon="fact_check"
            title="Rien à vérifier pour le moment"
            text="Les missions confirmées avec du matériel à contrôler apparaîtront ici."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {missions.map((mission) => {
            const open = openMissionId === mission.mission_id;
            const totalItems = mission.materiels.reduce((sum, m) => sum + m.total_items, 0);
            const checkedItems = mission.materiels.reduce((sum, m) => sum + m.checked_items, 0);
            const progress = totalItems > 0 ? Math.min(100, Math.round((checkedItems / totalItems) * 100)) : 0;

            return (
              <Card as="li" key={mission.mission_id}>
                <button
                  type="button"
                  onClick={() => setOpenMissionId(open ? null : mission.mission_id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left"
                >
                  <Icon
                    name="chevron_right"
                    size={18}
                    className={cn('shrink-0 text-ink-3 transition-transform duration-150', open && 'rotate-90')}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.04em] text-accent">{mission.category}</div>
                    <div className="mt-0.5 truncate text-base font-bold text-ink">{mission.title}</div>
                    <div className="mt-0.5 text-[12.5px] text-ink-3">
                      {new Date(mission.starts_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                      {mission.location ? ` · ${mission.location}` : ''}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-bold text-ink">{formatTimeRange(mission.starts_at, mission.ends_at)}</div>
                    <div className="mt-0.5 text-xs text-ink-3">{formatDuration(mission.starts_at, mission.ends_at)}</div>
                  </div>
                  <div className="h-1.5 w-[60px] shrink-0 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
                  </div>
                </button>

                {open ? (
                  <div className="flex flex-col border-t border-line-row px-5 pb-3.5">
                    {mission.materiels.length === 0 ? (
                      <p className="py-3 text-sm text-ink-3">Aucun matériel requis défini sur cette mission.</p>
                    ) : (
                      mission.materiels.map((materiel) => (
                        <div
                          key={materiel.mission_materiel_assignment_id}
                          className="flex items-center gap-3.5 border-t border-line-row py-2.5 first:border-t-0"
                        >
                          <span className={cn('h-2 w-2 shrink-0 rounded-full', getMissionVerificationMaterielDotClass(materiel.status))} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-bold text-ink">{materiel.name}</div>
                            <div className="text-[11.5px] text-ink-3">
                              {materiel.checked_items} / {materiel.total_items} items vérifiés
                            </div>
                          </div>
                          <Badge tone={MISSION_VERIFICATION_MATERIEL_STATUS_TONE[materiel.status]} className="shrink-0 whitespace-nowrap">
                            {MISSION_VERIFICATION_MATERIEL_STATUS_LABELS[materiel.status]}
                          </Badge>
                          <ArrowButton href={`/verification/${mission.mission_id}/${materiel.mission_materiel_assignment_id}`} />
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}
