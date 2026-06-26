'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import type { OpeDashboardData, OpeMission, RoleBehavior } from '@/lib/types';
import { MISSION_STATUS_LABELS, getMissionStatusBadgeClass, formatMissionRequirementLabel } from '@/lib/missions';
import {
  buildDayAxis,
  missionDayKey,
  formatMissionDuration,
  resolveMissionTypeColor,
} from '@/lib/mission-timeline';
import { SkillBadge } from '@/components/skills/skill-badge';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function formatTimeRange(startISO: string, endISO: string): string {
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  const start = new Date(startISO).toLocaleTimeString('fr-FR', opts);
  const end = new Date(endISO).toLocaleTimeString('fr-FR', opts);
  return `${start} – ${end}`;
}

function statusBadgeLabel(status: OpeMission['status']): string {
  return status === 'confirmed' ? 'Validé' : MISSION_STATUS_LABELS[status];
}

// ── Carte événement ───────────────────────────────────────────────
function EventCard({ mission }: { mission: OpeMission }) {
  const accent = resolveMissionTypeColor(mission.type.name, mission.type.color);
  const isValidated = mission.status === 'confirmed';

  return (
    <article
      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>
          {mission.type.name ?? 'Événement'}
        </span>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${getMissionStatusBadgeClass(
            mission.status
          )}`}
        >
          {statusBadgeLabel(mission.status)}
        </span>
      </div>

      <h3 className="mt-1 text-sm font-semibold text-slate-900">{mission.title}</h3>

      <dl className="mt-1.5 space-y-0.5 text-xs text-slate-600">
        <div>
          {formatTimeRange(mission.starts_at, mission.ends_at)}{' '}
          <span className="text-slate-400">({formatMissionDuration(mission.starts_at, mission.ends_at)})</span>
        </div>
        {mission.location ? <div>📍 {mission.location}</div> : null}
      </dl>

      {/* Besoins */}
      {mission.requiredSkills.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {mission.requiredSkills.map((rs) => (
            <span
              key={rs.id}
              className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
            >
              {formatMissionRequirementLabel(rs.skill?.name, rs.quantity)}
            </span>
          ))}
        </div>
      ) : null}

      {/* Équipe engagée (uniquement si validé) */}
      {isValidated ? (
        <div className="mt-2 border-t border-slate-100 pt-2">
          {mission.team.length === 0 ? (
            <p className="text-[11px] italic text-slate-400">Aucun secouriste engagé</p>
          ) : (
            <ul className="space-y-1.5">
              {mission.team.map((member) => (
                <li key={member.volunteer_id} className="text-xs">
                  <div className="font-medium text-slate-800">{member.full_name ?? 'Bénévole'}</div>
                  {member.validatedSkills.length > 0 ? (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {member.validatedSkills.map((skill) => (
                        <SkillBadge key={skill.id} name={skill.name} color={skill.color} />
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </article>
  );
}

// ── Page ──────────────────────────────────────────────────────────
export default function OpeDashboardPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OpeDashboardData | null>(null);

  const [days, setDays] = useState<7 | 14>(7);
  const [offsetDays, setOffsetDays] = useState(0);

  const fromISO = useMemo(() => {
    const d = startOfToday();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString();
  }, [offsetDays]);

  // Accès (une fois)
  useEffect(() => {
    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace('/login');
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const tok = sessionData.session?.access_token ?? '';
      setToken(tok);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      let ok = profileData?.role === 'admin' || profileData?.role === 'responsable';
      if (!ok) {
        const res = await fetch('/api/roles/mine', { headers: { Authorization: `Bearer ${tok}` } });
        if (res.ok) {
          const { behaviors } = (await res.json()) as { behaviors: RoleBehavior[] };
          ok = behaviors.some((b) => b.resource_type === 'mission' && b.behavior_type === 'can_manage');
        }
      }
      setAllowed(ok);
      if (!ok) setLoading(false);
    }
    void init();
  }, [router]);

  // Chargement des données (à chaque changement de fenêtre)
  useEffect(() => {
    if (!allowed || !token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/ope-dashboard?from=${encodeURIComponent(fromISO)}&days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (cancelled) return;
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? 'Erreur lors du chargement.');
        setLoading(false);
        return;
      }
      const json = (await res.json()) as OpeDashboardData;
      setData(json);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [allowed, token, fromISO, days]);

  // Regroupement des missions par jour
  const missionsByDay = useMemo(() => {
    const map = new Map<string, OpeMission[]>();
    for (const mission of data?.missions ?? []) {
      const key = missionDayKey(mission.starts_at);
      const list = map.get(key) ?? [];
      list.push(mission);
      map.set(key, list);
    }
    return map;
  }, [data]);

  const dayAxis = useMemo(() => buildDayAxis(fromISO, days), [fromISO, days]);

  if (allowed === false) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Accès refusé : page réservée au pilotage opérationnel (admin, responsable ou gestionnaire de missions).
      </div>
    );
  }

  const rangeStart = new Date(fromISO);
  const rangeEnd = new Date(new Date(fromISO).getTime() + (days - 1) * DAY_MS);
  const rangeLabel = `${rangeStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${rangeEnd.toLocaleDateString(
    'fr-FR',
    { day: 'numeric', month: 'short' }
  )}`;

  return (
    <div>
      {/* breadcrumb */}
      <div className="mb-3 text-xs font-semibold text-slate-400">
        OPE <span className="text-slate-300">›</span>{' '}
        <span className="text-slate-500">Tableau de bord</span>
      </div>

      {/* titre */}
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Tableau de bord OPE</h1>
        <p className="mt-1 text-sm text-slate-500">
          Suivi de l&apos;engagement des moyens et des personnes sur les prochains jours.
        </p>
      </div>

      {/* contrôles fenêtre */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOffsetDays((o) => o - days)}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50"
        >
          ← Précédent
        </button>
        <button
          type="button"
          onClick={() => setOffsetDays(0)}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50"
        >
          Aujourd&apos;hui
        </button>
        <button
          type="button"
          onClick={() => setOffsetDays((o) => o + days)}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50"
        >
          Suivant →
        </button>
        <span className="ml-1 text-sm font-medium text-slate-600">{rangeLabel}</span>

        <div className="ml-auto inline-flex overflow-hidden rounded-md border border-slate-300">
          {([7, 14] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`px-3 py-1 text-sm ${
                days === d ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {d} jours
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {/* board */}
      {loading && !data ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3" style={{ minWidth: 'min-content' }}>
            {dayAxis.map((day) => {
              const missions = missionsByDay.get(day.key) ?? [];
              return (
                <section key={day.key} className="flex w-60 shrink-0 flex-col rounded-lg bg-slate-50 p-2">
                  <header className="mb-2 flex items-baseline justify-between px-1">
                    <span className="text-sm font-semibold capitalize text-slate-700">{capitalize(day.label)}</span>
                    {missions.length > 0 ? (
                      <span className="text-xs text-slate-400">{missions.length}</span>
                    ) : null}
                  </header>
                  <div className="flex flex-col gap-2">
                    {missions.length === 0 ? (
                      <p className="rounded-md border border-dashed border-slate-200 px-2 py-3 text-center text-xs text-slate-400">
                        Aucun événement
                      </p>
                    ) : (
                      missions.map((mission) => <EventCard key={mission.id} mission={mission} />)
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* section matériel — phase 2 */}
      <section className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-700">Matériel disponible et non engagé</h2>
        <p className="mt-1 text-xs text-slate-500">
          À venir (phase 2) : suivi des moyens matériels (VPS, VTP…), engagés par événement et disponibles sur la
          période.
        </p>
      </section>
    </div>
  );
}
