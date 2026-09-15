'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { usePermissions } from '@/lib/permissions/permissions-context';
import type { AvailabilityDayAggregate, AvailabilityLevel } from '@/lib/types';
import { buildMonthGrids, DOW_LABELS } from '@/lib/availability';
import { Card, PageHeader } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

const HORIZON_MONTHS = 3;
const LEGEND_ALPHAS = [0.12, 0.3, 0.5, 0.7, 1];

type Metric = 'score' | 'ready';

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function AvailabilityAdminPageClient() {
  const router = useRouter();
  const { loading: permissionsLoading, can } = usePermissions();
  const allowed = can('mission', 'can_manage');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [volunteerCount, setVolunteerCount] = useState(0);
  const [daysByIso, setDaysByIso] = useState<Map<string, AvailabilityDayAggregate>>(new Map());
  const [metric, setMetric] = useState<Metric>('score');

  const monthGrids = useMemo(() => buildMonthGrids(HORIZON_MONTHS), []);

  // Accès (une fois) : garde effective = permission côté API ; ici gestion UX seule.
  useEffect(() => {
    if (permissionsLoading) return;
    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace('/login');
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      setToken(sessionData.session?.access_token ?? '');
      if (!allowed) setLoading(false);
    }
    void init();
  }, [router, permissionsLoading, allowed]);

  useEffect(() => {
    if (!allowed || !token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/availability?months=${HORIZON_MONTHS}`, { headers: { Authorization: `Bearer ${token}` } });
      if (cancelled) return;
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? 'Erreur lors du chargement.');
        setLoading(false);
        return;
      }
      const json = (await res.json()) as { volunteerCount: number; days: AvailabilityDayAggregate[] };
      setVolunteerCount(json.volunteerCount);
      setDaysByIso(new Map(json.days.map((day) => [day.day, day])));
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [allowed, token]);

  if (!permissionsLoading && !allowed) {
    return (
      <div className="rounded-[15px] border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
        Accès refusé : page réservée aux gestionnaires de missions.
      </div>
    );
  }

  const scoreMax = Math.max(1, volunteerCount * 3);

  function cellVisual(entry: AvailabilityDayAggregate | undefined): { background: string; textClass: string } {
    if (!entry || entry.respondedCount === 0) return { background: '#F7F9FC', textClass: 'text-ink-3' };
    if (entry.zeroCount === entry.respondedCount) return { background: '#FDEAEA', textClass: 'text-bad' };

    const value = metric === 'score' ? entry.score : entry.readyCount;
    const max = metric === 'score' ? scoreMax : Math.max(1, volunteerCount);
    const fraction = Math.max(0, Math.min(1, value / max));
    const alpha = 0.12 + 0.88 * fraction;
    return { background: `rgba(5,150,105,${alpha})`, textClass: fraction > 0.5 ? 'text-white' : 'text-ink' };
  }

  function tooltip(iso: string, entry: AvailabilityDayAggregate | undefined): string {
    const label = longDate(iso);
    if (!entry || entry.respondedCount === 0) return `${label} — personne n'a répondu`;

    const breakdown = ([0, 1, 2, 3] as AvailabilityLevel[])
      .filter((level) => entry.levelCounts[level] > 0)
      .map((level) => `${entry.levelCounts[level]}×${level}`)
      .join(' + ');
    const notResponded = Math.max(0, volunteerCount - entry.respondedCount);
    const readyLabel = `${entry.readyCount} prêt${entry.readyCount > 1 ? 's' : ''} (≥ 2)`;

    return `${label} — score ${entry.score} (${breakdown}) · ${readyLabel} · ${entry.zeroCount} indispo · ${notResponded} sans réponse`;
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Dispos de l'équipe"
        subtitle={`Score de dispo par jour — la somme des niveaux déclarés (0→3) par les ${volunteerCount} bénévoles · sans engagement`}
        actions={
          <div className="flex gap-1 rounded-[10px] bg-[#E4E9F2] p-1">
            {(
              [
                { key: 'score', label: 'Score cumulé' },
                { key: 'ready', label: 'Prêts (≥ 2)' }
              ] as const
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setMetric(option.key)}
                className={cn(
                  'rounded-[7px] px-3.5 py-1.5 text-[13px] font-semibold transition',
                  metric === option.key ? 'bg-brand text-white' : 'text-ink-2 hover:text-ink'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      {error ? <div className="mb-4 rounded-lg border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div> : null}

      {loading ? (
        <p className="text-sm text-ink-2">Chargement...</p>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {monthGrids.map((grid) => (
            <Card key={grid.key} className="p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3">{grid.label}</div>
              <div className="mt-2.5 grid grid-cols-7 gap-1">
                {DOW_LABELS.map((label, i) => (
                  <div key={i} className="text-center text-[10.5px] font-bold text-ink-4">
                    {label}
                  </div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {grid.cells.map((cell, i) => {
                  if (!cell) return <div key={i} />;
                  const entry = daysByIso.get(cell.iso);
                  const { background, textClass } = cellVisual(entry);
                  const value = entry ? (metric === 'score' ? entry.score : entry.readyCount) : null;
                  return (
                    <div
                      key={cell.iso}
                      data-testid="availability-heatmap-cell"
                      data-day={cell.iso}
                      title={tooltip(cell.iso, entry)}
                      className={cn(
                        'flex aspect-square flex-col items-center justify-center rounded-[9px]',
                        textClass,
                        cell.isPast && 'opacity-35'
                      )}
                      style={{ background }}
                    >
                      <span className="text-[10px] opacity-70">{cell.dayOfMonth}</span>
                      <span className="text-[13px] font-bold">{value ?? '·'}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-ink-3">
        <div className="flex items-center gap-1.5">
          <span>0</span>
          <span className="flex overflow-hidden rounded">
            {LEGEND_ALPHAS.map((alpha) => (
              <span key={alpha} className="h-4 w-4" style={{ background: `rgba(5,150,105,${alpha})` }} />
            ))}
          </span>
          <span>{scoreMax} pts</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-4 w-4 rounded" style={{ background: '#FDEAEA' }} />
          Tous indispo
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-4 w-4 rounded border border-line" style={{ background: '#F7F9FC' }} />
          Personne n&apos;a répondu
        </div>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
        <Icon name="info" size={14} />
        Survole un jour pour le détail. Tendance indicative — seule la réponse à une mission engage le bénévole.
      </p>
    </div>
  );
}
