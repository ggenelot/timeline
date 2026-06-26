'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { OpePersonActivity } from '@/lib/types';
import { resolveMissionTypeColor, formatMissionDuration } from '@/lib/mission-timeline';
import { SkillBadge } from '@/components/skills/skill-badge';
import { StatusBadge } from '@/components/ope/atoms';

function ActivityRow({ activity }: { activity: OpePersonActivity }) {
  const accent = resolveMissionTypeColor(activity.type.name, activity.type.color);
  const date = new Date(activity.starts_at).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: accent }}>
          {activity.type.name ?? 'Événement'}
        </span>
        <StatusBadge status={activity.status} />
      </div>
      <Link href={`/missions/${activity.mission_id}`} className="mt-0.5 block text-sm font-semibold text-slate-900 hover:underline">
        {activity.title}
      </Link>
      <div className="mt-0.5 text-xs capitalize text-slate-500">
        {date}{' '}
        <span className="text-slate-400">({formatMissionDuration(activity.starts_at, activity.ends_at)})</span>
      </div>
      {activity.assignedSkill ? (
        <div className="mt-1.5">
          <SkillBadge name={activity.assignedSkill.name} color={activity.assignedSkill.color} />
        </div>
      ) : null}
    </li>
  );
}

export function PersonActivityPanel({
  volunteerId,
  volunteerName,
  token,
  onClose,
}: {
  volunteerId: string;
  volunteerName: string;
  token: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<OpePersonActivity[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `/api/admin/ope-dashboard/volunteer-activities?volunteer_id=${encodeURIComponent(volunteerId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (cancelled) return;
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? 'Erreur lors du chargement.');
        setLoading(false);
        return;
      }
      const json = (await res.json()) as { activities: OpePersonActivity[] };
      setActivities(json.activities ?? []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [volunteerId, token]);

  const now = new Date().toISOString();
  const upcoming = activities.filter((a) => a.starts_at >= now).slice().reverse(); // ascendant
  const past = activities.filter((a) => a.starts_at < now); // déjà desc

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose} role="presentation">
      <aside
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Activités de ${volunteerName}`}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Activités de</div>
            <h2 className="text-lg font-bold text-slate-900">{volunteerName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Fermer
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-slate-500">Chargement…</p>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : activities.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune activité enregistrée pour cette personne.</p>
          ) : (
            <>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  À venir ({upcoming.length})
                </h3>
                {upcoming.length === 0 ? (
                  <p className="text-sm italic text-slate-400">Rien de prévu.</p>
                ) : (
                  <ul className="space-y-2">
                    {upcoming.map((a) => (
                      <ActivityRow key={`${a.mission_id}-${a.starts_at}`} activity={a} />
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Passées ({past.length})
                </h3>
                {past.length === 0 ? (
                  <p className="text-sm italic text-slate-400">Aucune activité passée.</p>
                ) : (
                  <ul className="space-y-2">
                    {past.map((a) => (
                      <ActivityRow key={`${a.mission_id}-${a.starts_at}`} activity={a} />
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
