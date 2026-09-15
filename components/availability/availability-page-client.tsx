'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { AvailabilityLevel } from '@/lib/types';
import { AVAILABILITY_LEVEL_LABELS, AVAILABILITY_LEVEL_STYLES, buildMonthGrids, monthRangeISO, DOW_LABELS } from '@/lib/availability';
import { Card, PageHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

const HORIZON_MONTHS = 3;
const LEVELS: AvailabilityLevel[] = [0, 1, 2, 3];

export function AvailabilityPageClient() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [days, setDays] = useState<Record<string, AvailabilityLevel>>({});
  const [brush, setBrush] = useState<AvailabilityLevel>(3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const paintOnRef = useRef(false);
  const pendingUpsertsRef = useRef<Map<string, AvailabilityLevel>>(new Map());
  const pendingDeletesRef = useRef<Set<string>>(new Set());

  const monthGrids = useMemo(() => buildMonthGrids(HORIZON_MONTHS), []);
  const { fromISO, toISO } = useMemo(() => monthRangeISO(HORIZON_MONTHS), []);

  const loadDays = useCallback(
    async (volunteerId: string) => {
      const { data, error: selectError } = await supabase
        .from('availability_declarations')
        .select('day,level')
        .eq('volunteer_id', volunteerId)
        .gte('day', fromISO)
        .lt('day', toISO);

      if (selectError) {
        setError(`Impossible de charger vos disponibilités : ${selectError.message}`);
        return;
      }

      const next: Record<string, AvailabilityLevel> = {};
      (data ?? []).forEach((row) => {
        next[row.day] = row.level as AvailabilityLevel;
      });
      setDays(next);
    },
    [fromISO, toISO]
  );

  useEffect(() => {
    async function init() {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session?.user) {
        router.replace('/login');
        return;
      }
      setUserId(session.user.id);
      await loadDays(session.user.id);
      setLoading(false);
    }
    void init();
  }, [router, loadDays]);

  const flushPending = useCallback(async () => {
    if (!userId) return;
    const upserts = Array.from(pendingUpsertsRef.current.entries());
    const deletes = Array.from(pendingDeletesRef.current);
    if (upserts.length === 0 && deletes.length === 0) return;

    pendingUpsertsRef.current = new Map();
    pendingDeletesRef.current = new Set();

    if (upserts.length > 0) {
      const { error: upsertError } = await supabase.from('availability_declarations').upsert(
        upserts.map(([day, level]) => ({ volunteer_id: userId, day, level, updated_at: new Date().toISOString() })),
        { onConflict: 'volunteer_id,day' }
      );
      if (upsertError) setError(`Enregistrement impossible : ${upsertError.message}`);
    }

    if (deletes.length > 0) {
      const { error: deleteError } = await supabase
        .from('availability_declarations')
        .delete()
        .eq('volunteer_id', userId)
        .in('day', deletes);
      if (deleteError) setError(`Enregistrement impossible : ${deleteError.message}`);
    }

    await loadDays(userId);
  }, [userId, loadDays]);

  useEffect(() => {
    function onPointerEnd() {
      paintOnRef.current = false;
      void flushPending();
    }
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    return () => {
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [flushPending]);

  // Palette compacte : visible dès que le sélecteur complet sort de l'écran,
  // pour changer de pinceau sans remonter en haut de la page.
  const pickerRef = useRef<HTMLDivElement>(null);
  const [showMiniBrush, setShowMiniBrush] = useState(false);

  useEffect(() => {
    const el = pickerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setShowMiniBrush(!entry.isIntersecting), { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function paintDay(iso: string, toggle: boolean) {
    setDays((prev) => {
      const already = prev[iso];
      const next = { ...prev };
      if (toggle && already === brush) {
        delete next[iso];
        pendingUpsertsRef.current.delete(iso);
        pendingDeletesRef.current.add(iso);
      } else {
        next[iso] = brush;
        pendingDeletesRef.current.delete(iso);
        pendingUpsertsRef.current.set(iso, brush);
      }
      return next;
    });
  }

  async function clearAllDays() {
    if (!userId) return;
    setError(null);
    pendingUpsertsRef.current = new Map();
    pendingDeletesRef.current = new Set();
    setDays({});

    const { error: deleteError } = await supabase
      .from('availability_declarations')
      .delete()
      .eq('volunteer_id', userId)
      .gte('day', fromISO)
      .lt('day', toISO);

    if (deleteError) {
      setError(`Impossible de tout effacer : ${deleteError.message}`);
      await loadDays(userId);
    }
  }

  const filledCount = Object.keys(days).length;
  const totalDaysCount = useMemo(() => monthGrids.reduce((sum, grid) => sum + grid.cells.filter(Boolean).length, 0), [monthGrids]);

  if (loading) {
    return <p className="text-sm text-ink-2">Chargement...</p>;
  }

  return (
    <div className="mx-auto w-full max-w-[520px]">
      <PageHeader title="Mes dispos" subtitle="Donne la tendance sur les 3 prochains mois. Sans engagement — tu changes quand tu veux." />

      {error ? <div className="mb-4 rounded-lg border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div> : null}

      <div ref={pickerRef}>
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Je peins avec</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {LEVELS.map((level) => {
            const selected = brush === level;
            const style = AVAILABILITY_LEVEL_STYLES[level];
            const soloThree = selected && level === 3;
            return (
              <button
                key={level}
                type="button"
                onClick={() => setBrush(level)}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-3 py-2.5 text-left font-sans transition',
                  selected ? cn(style.bg, 'border-[1.5px]', style.border, 'shadow-card') : 'border border-line bg-surface-card'
                )}
              >
                <span
                  className={cn(
                    'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-lg text-xs font-extrabold',
                    soloThree ? 'text-engage' : 'text-white'
                  )}
                  style={{ background: soloThree ? '#FFFFFF' : style.solid }}
                >
                  {level}
                </span>
                <span className={cn('text-[13px] font-bold', selected ? style.text : 'text-ink-2')}>{AVAILABILITY_LEVEL_LABELS[level]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-3">
        <Icon name="swipe" size={16} />
        Touche un jour pour peindre (glisse à la souris pour peindre plusieurs jours d&apos;un coup)
      </p>

      {monthGrids.map((grid) => (
        <div key={grid.key} className="mt-5">
          <div className="pl-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3">{grid.label}</div>
          <Card className="mt-2 p-3">
            <div className="mb-1.5 grid grid-cols-7 gap-1">
              {DOW_LABELS.map((label, i) => (
                <div key={i} className="text-center text-[10.5px] font-bold text-ink-4">
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1" style={{ touchAction: 'pan-y' }}>
              {grid.cells.map((cell, i) => {
                if (!cell) return <div key={i} />;
                const level = days[cell.iso];
                const set = level !== undefined;
                const style = set ? AVAILABILITY_LEVEL_STYLES[level] : null;
                return (
                  <div
                    key={cell.iso}
                    data-testid="availability-day-cell"
                    data-day={cell.iso}
                    onPointerDown={
                      cell.isPast
                        ? undefined
                        : () => {
                            paintOnRef.current = true;
                            paintDay(cell.iso, true);
                          }
                    }
                    onPointerEnter={
                      cell.isPast
                        ? undefined
                        : (event) => {
                            // Le tactile ne déclenche pas d'enter en continu (capture implicite du
                            // pointeur) : seul le tap fonctionne, ce qui laisse le scroll natif intact.
                            if (paintOnRef.current && event.pointerType !== 'touch') paintDay(cell.iso, false);
                          }
                    }
                    className={cn(
                      'flex aspect-square select-none items-center justify-center rounded-[9px] border text-[13px]',
                      style
                        ? cn(style.bg, style.text, 'border-transparent font-bold')
                        : cn('border-line font-normal text-ink-3', cell.isWeekend ? 'bg-surface-sub' : 'bg-surface-card'),
                      cell.isPast ? 'opacity-30' : 'cursor-pointer'
                    )}
                  >
                    {cell.dayOfMonth}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ))}

      <Card className="mt-5 flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-sm font-bold text-ink">
            {filledCount} jour{filledCount > 1 ? 's' : ''} renseigné{filledCount > 1 ? 's' : ''} sur {totalDaysCount}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
            <Icon name="cloud_done" size={14} />
            Enregistré automatiquement
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={clearAllDays}>
          Tout effacer
        </Button>
      </Card>

      <div
        aria-hidden={!showMiniBrush}
        className={cn(
          'fixed inset-x-0 z-20 flex justify-center px-4 transition-all duration-200 lg:inset-x-auto lg:right-6 lg:justify-end lg:px-0',
          'bottom-[calc(94px+env(safe-area-inset-bottom))] lg:bottom-6',
          showMiniBrush ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
        )}
      >
        <div className="flex items-center gap-1.5 rounded-full border border-white/70 bg-white/90 p-1.5 shadow-[0_18px_40px_-16px_rgba(12,19,38,.45)] backdrop-blur-md backdrop-saturate-[2]">
          {LEVELS.map((level) => {
            const selected = brush === level;
            const style = AVAILABILITY_LEVEL_STYLES[level];
            const soloThree = selected && level === 3;
            return (
              <button
                key={level}
                type="button"
                onClick={() => setBrush(level)}
                aria-label={`Peindre avec : ${AVAILABILITY_LEVEL_LABELS[level]}`}
                aria-pressed={selected}
                tabIndex={showMiniBrush ? 0 : -1}
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold transition',
                  soloThree ? 'text-engage' : 'text-white',
                  selected ? 'ring-2 ring-ink/70 ring-offset-2 ring-offset-white' : 'opacity-55'
                )}
                style={{ background: soloThree ? '#FFFFFF' : style.solid }}
              >
                {level}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
