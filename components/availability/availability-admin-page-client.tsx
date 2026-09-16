'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { usePermissions } from '@/lib/permissions/permissions-context';
import type { AvailabilityDayAggregate, AvailabilityLevel, AvailabilityPersonName } from '@/lib/types';
import { buildMonthGrids, formatConstraint, DOW_LABELS } from '@/lib/availability';
import { Card, PageHeader } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

const HORIZON_MONTHS = 3;
const LEGEND_ALPHAS = [0.12, 0.3, 0.5, 0.7, 1];
const MAX_NAMES_PER_LEVEL = 6;
const TOOLTIP_WIDTH = 250;
const TOOLTIP_MARGIN = 8;
const FLIP_THRESHOLD = 270;

type Metric = 'score' | 'ready';
type HoverState = { iso: string; rect: { left: number; right: number; top: number; bottom: number; width: number } };

// Badge carré du niveau dans la carte de survol (couleurs de la maquette).
const LEVEL_BADGE: Record<AvailabilityLevel, { bg: string; text: string; border: string }> = {
  0: { bg: '#FDEAEA', text: '#D14343', border: '#F3C8C8' },
  1: { bg: '#FEF3E2', text: '#B45309', border: '#F6DFB0' },
  2: { bg: '#E9F7EF', text: '#12805A', border: '#BDE7CE' },
  3: { bg: '#059669', text: '#FFFFFF', border: '#059669' }
};

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function shortDate(iso: string): string {
  const label = new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
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
  const [hover, setHover] = useState<HoverState | null>(null);

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

  function cellVisual(entry: AvailabilityDayAggregate | undefined): { background: string; textClass: string; onDark: boolean } {
    if (!entry || entry.respondedCount === 0) return { background: '#F7F9FC', textClass: 'text-ink-3', onDark: false };
    if (entry.zeroCount === entry.respondedCount) return { background: '#FDEAEA', textClass: 'text-bad', onDark: false };

    const value = metric === 'score' ? entry.score : entry.readyCount;
    const max = metric === 'score' ? scoreMax : Math.max(1, volunteerCount);
    const fraction = Math.max(0, Math.min(1, value / max));
    const alpha = 0.12 + 0.88 * fraction;
    return { background: `rgba(5,150,105,${alpha})`, textClass: fraction > 0.5 ? 'text-white' : 'text-ink', onDark: fraction > 0.5 };
  }

  const hoverEntry = hover ? daysByIso.get(hover.iso) : undefined;

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
                  const { background, textClass, onDark } = cellVisual(entry);
                  const value = entry ? (metric === 'score' ? entry.score : entry.readyCount) : null;
                  const hasConstraint = (entry?.constraintCount ?? 0) > 0;
                  return (
                    <div
                      key={cell.iso}
                      data-testid="availability-heatmap-cell"
                      data-day={cell.iso}
                      onMouseEnter={(event) => {
                        const r = event.currentTarget.getBoundingClientRect();
                        setHover({ iso: cell.iso, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width } });
                      }}
                      onMouseLeave={() => setHover((prev) => (prev?.iso === cell.iso ? null : prev))}
                      className={cn(
                        'relative flex aspect-square flex-col items-center justify-center rounded-[9px]',
                        textClass,
                        cell.isPast && 'opacity-35'
                      )}
                      style={{ background }}
                    >
                      <span className="text-[10px] opacity-70">{cell.dayOfMonth}</span>
                      <span className="text-[13px] font-bold">{value ?? '·'}</span>
                      {hasConstraint ? (
                        <span
                          aria-hidden
                          className="absolute right-1 top-1 h-[5px] w-[5px] rounded-full"
                          style={{ background: onDark ? '#FFFFFF' : '#002D74' }}
                        />
                      ) : null}
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
        <div className="flex items-center gap-1.5">
          <span className="relative h-4 w-4 rounded border border-line" style={{ background: '#F7F9FC' }}>
            <span className="absolute right-0.5 top-0.5 h-[5px] w-[5px] rounded-full" style={{ background: '#002D74' }} />
          </span>
          Contrainte horaire (détail au survol)
        </div>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
        <Icon name="info" size={14} />
        Survole un jour pour voir qui est dispo. Tendance indicative — seule la réponse à une mission engage le bénévole.
      </p>

      {hover && hoverEntry && hoverEntry.respondedCount > 0 ? <AvailabilityTooltip hover={hover} entry={hoverEntry} /> : null}
    </div>
  );
}

function AvailabilityTooltip({ hover, entry }: { hover: HoverState; entry: AvailabilityDayAggregate }) {
  const { rect } = hover;
  const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 768 : window.innerHeight;

  const centered = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
  const left = Math.max(TOOLTIP_MARGIN, Math.min(centered, viewportWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN));
  const placeAbove = viewportHeight - rect.bottom < FLIP_THRESHOLD;

  const positionStyle = placeAbove
    ? { top: rect.top - TOOLTIP_MARGIN, transform: 'translateY(-100%)' }
    : { top: rect.bottom + TOOLTIP_MARGIN };

  const levels: AvailabilityLevel[] = [3, 2, 1, 0];

  return (
    <div
      data-testid="availability-tooltip"
      className="pointer-events-none fixed z-[60]"
      style={{ left, width: TOOLTIP_WIDTH, ...positionStyle }}
    >
      <div
        className="rounded-[14px] border bg-white px-[14px] py-3"
        style={{ borderColor: '#E6EAF2', boxShadow: '0 16px 40px -18px rgba(12,19,38,.5)' }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-bold text-ink">{shortDate(entry.day)}</span>
          <span className="text-[13px] font-bold" style={{ color: '#12805A' }}>
            {entry.score} pts
          </span>
        </div>

        <div className="mt-2 flex flex-col gap-1.5">
          {levels
            .filter((level) => entry.namesByLevel[level].length > 0)
            .map((level) => (
              <LevelLine key={level} level={level} people={entry.namesByLevel[level]} />
            ))}
        </div>

        {entry.noResponseNames.length > 0 ? (
          <div className="mt-2 border-t pt-2 text-[11.5px]" style={{ borderColor: '#EEF1F6', color: '#8A93A6' }}>
            {entry.noResponseNames.length} sans réponse · {truncateNames(entry.noResponseNames)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LevelLine({ level, people }: { level: AvailabilityLevel; people: AvailabilityPersonName[] }) {
  const badge = LEVEL_BADGE[level];
  const shown = people.slice(0, MAX_NAMES_PER_LEVEL);
  const extra = people.length - shown.length;

  return (
    <div className="flex items-start gap-2">
      <span
        className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border text-[11px] font-extrabold"
        style={{ background: badge.bg, color: badge.text, borderColor: badge.border }}
      >
        {level}
      </span>
      <span className="text-[12.5px] leading-snug text-ink">
        {shown.map((person, index) => {
          const constraint = formatConstraint(person.available_from, person.available_until);
          return (
            <Fragment key={`${person.name}-${index}`}>
              {index > 0 ? ', ' : ''}
              {person.name}
              {constraint ? (
                <>
                  {' '}
                  <span className="font-bold" style={{ color: '#1E3C87' }}>
                    {constraint}
                  </span>
                </>
              ) : null}
            </Fragment>
          );
        })}
        {extra > 0 ? <span className="text-ink-3">, +{extra} autres</span> : null}
      </span>
    </div>
  );
}

function truncateNames(names: string[]): string {
  if (names.length <= MAX_NAMES_PER_LEVEL) return names.join(', ');
  return `${names.slice(0, MAX_NAMES_PER_LEVEL).join(', ')}, +${names.length - MAX_NAMES_PER_LEVEL} autres`;
}
