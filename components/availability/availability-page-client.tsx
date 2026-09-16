'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { AvailabilityLevel } from '@/lib/types';
import {
  AVAILABILITY_LEVEL_LABELS,
  AVAILABILITY_LEVEL_STYLES,
  AVAILABILITY_FROM_HOURS,
  AVAILABILITY_UNTIL_HOURS,
  buildMonthGrids,
  monthRangeISO,
  hourToTime,
  timeToHour,
  DOW_LABELS
} from '@/lib/availability';
import { Card, PageHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useHeaderSlot } from '@/lib/header-slot';
import { cn } from '@/lib/cn';

const HORIZON_MONTHS = 3;
const LEVELS: AvailabilityLevel[] = [0, 1, 2, 3];
const LONG_PRESS_MS = 450;

type Precision = { from: string | null; until: string | null };

function hasConstraint(precision: Precision | undefined): boolean {
  return !!precision && (precision.from !== null || precision.until !== null);
}

function longDate(iso: string): string {
  const label = new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function AvailabilityPageClient() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [days, setDays] = useState<Record<string, AvailabilityLevel>>({});
  const [precisions, setPrecisions] = useState<Record<string, Precision>>({});
  const [brush, setBrush] = useState<AvailabilityLevel>(3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetIso, setSheetIso] = useState<string | null>(null);

  const paintOnRef = useRef(false);
  const pendingUpsertsRef = useRef<Map<string, AvailabilityLevel>>(new Map());
  const pendingDeletesRef = useRef<Set<string>>(new Set());
  const precisionsRef = useRef<Record<string, Precision>>({});
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Position de départ de l'appui long : on annule sur un vrai déplacement
  // (glisser/scroll) au-delà d'un seuil, pas sur le `pointercancel` que le
  // tactile déclenche seul (rappel de menu iOS/Android) sur un doigt immobile —
  // sinon la feuille ne s'ouvrait jamais sur mobile.
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  // Chaîne d'écritures : sérialise tous les upsert/delete d'un même écran pour
  // que leur ordre d'arrivée corresponde à l'ordre d'émission (sinon un flush de
  // peinture lent peut écraser une précision enregistrée juste après).
  const writeChainRef = useRef<Promise<unknown>>(Promise.resolve());

  const enqueueWrite = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = writeChainRef.current.then(task, task);
    writeChainRef.current = run.then(
      () => undefined,
      () => undefined
    );
    return run as Promise<T>;
  }, []);

  useEffect(() => {
    precisionsRef.current = precisions;
  }, [precisions]);

  const monthGrids = useMemo(() => buildMonthGrids(HORIZON_MONTHS), []);
  const { fromISO, toISO } = useMemo(() => monthRangeISO(HORIZON_MONTHS), []);

  const loadDays = useCallback(
    async (volunteerId: string) => {
      const { data, error: selectError } = await supabase
        .from('availability_declarations')
        .select('day,level,available_from,available_until')
        .eq('volunteer_id', volunteerId)
        .gte('day', fromISO)
        .lt('day', toISO);

      if (selectError) {
        setError(`Impossible de charger vos disponibilités : ${selectError.message}`);
        return;
      }

      const nextDays: Record<string, AvailabilityLevel> = {};
      const nextPrecisions: Record<string, Precision> = {};
      (data ?? []).forEach((row) => {
        nextDays[row.day] = row.level as AvailabilityLevel;
        if (row.available_from !== null || row.available_until !== null) {
          nextPrecisions[row.day] = { from: row.available_from, until: row.available_until };
        }
      });
      setDays(nextDays);
      setPrecisions(nextPrecisions);
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
    const uid = userId;
    const upserts = Array.from(pendingUpsertsRef.current.entries());
    const deletes = Array.from(pendingDeletesRef.current);
    if (upserts.length === 0 && deletes.length === 0) return;

    pendingUpsertsRef.current = new Map();
    pendingDeletesRef.current = new Set();

    await enqueueWrite(async () => {
      if (upserts.length > 0) {
        // On renseigne toujours les colonnes horaires : niveau 0 => null (invariant
        // de la contrainte CHECK), niveau > 0 => on préserve la précision existante.
        const { error: upsertError } = await supabase.from('availability_declarations').upsert(
          upserts.map(([day, level]) => {
            const precision = level > 0 ? precisionsRef.current[day] : undefined;
            return {
              volunteer_id: uid,
              day,
              level,
              available_from: precision?.from ?? null,
              available_until: precision?.until ?? null,
              updated_at: new Date().toISOString()
            };
          }),
          { onConflict: 'volunteer_id,day' }
        );
        if (upsertError) setError(`Enregistrement impossible : ${upsertError.message}`);
      }

      if (deletes.length > 0) {
        const { error: deleteError } = await supabase.from('availability_declarations').delete().eq('volunteer_id', uid).in('day', deletes);
        if (deleteError) setError(`Enregistrement impossible : ${deleteError.message}`);
      }

      await loadDays(uid);
    });
  }, [userId, loadDays, enqueueWrite]);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  useEffect(() => {
    const MOVE_THRESHOLD = 10; // px : au-delà, c'est un glisser/scroll, pas un appui long.

    function onPointerUp() {
      paintOnRef.current = false;
      clearLongPress();
      void flushPending();
    }
    function onPointerCancel() {
      // Un `pointercancel` alors que l'appui long est encore en cours et que le
      // doigt n'a pas bougé vient du geste natif (menu contextuel/rappel) : on
      // laisse le minuteur aller au bout plutôt que de tout annuler. Le flush de
      // la peinture est différé — le minuteur, en s'ouvrant, annulera le toggle.
      if (longPressTimerRef.current !== null) {
        paintOnRef.current = false;
        return;
      }
      paintOnRef.current = false;
      void flushPending();
    }
    function onPointerMove(event: PointerEvent) {
      const start = longPressStartRef.current;
      if (longPressTimerRef.current === null || !start) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_THRESHOLD) {
        clearLongPress();
      }
    }
    // `touchend` reste émis même après un `pointercancel` (contrairement à
    // `pointerup`) : c'est le signal fiable de lever du doigt, qui annule un
    // appui trop court relâché avant les 450 ms.
    function onTouchEnd() {
      paintOnRef.current = false;
      clearLongPress();
      void flushPending();
    }
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [flushPending, clearLongPress]);

  // Palette compacte : visible dès que le sélecteur complet passe sous le header
  // sticky, pour changer de pinceau sans remonter en haut de la page.
  const pickerRef = useRef<HTMLDivElement>(null);
  const [showMiniBrush, setShowMiniBrush] = useState(false);

  useEffect(() => {
    const el = pickerRef.current;
    if (!el) return;
    // Seuils avec hystérésis : afficher quand le bas des gros boutons passe
    // au-dessus du header (~56px), masquer seulement bien plus haut. L'écart doit
    // dépasser la hauteur de la rangée mini — sinon, comme celle-ci s'insère dans
    // le header sticky (flux normal) et repousse le contenu, montrer/masquer près
    // du seuil oscillerait à chaque frame.
    const SHOW_AT = 56;
    const HIDE_AT = 140;
    let visible = false;
    // Listener scroll passif : on ne met à jour l'état React que sur changement.
    const update = () => {
      const bottom = el.getBoundingClientRect().bottom;
      const next = visible ? bottom < HIDE_AT : bottom <= SHOW_AT;
      if (next !== visible) {
        visible = next;
        setShowMiniBrush(next);
      }
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  // Rangée mini injectée dans le header sticky (mobile) — même état que les gros
  // boutons. Mémorisée pour ne reposer le slot que sur changement de sélection.
  const miniBrushRow = useMemo(
    () => (showMiniBrush ? <MiniBrushRow brush={brush} onSelect={setBrush} /> : null),
    [showMiniBrush, brush]
  );
  useHeaderSlot(miniBrushRow);

  function dropPrecision(iso: string) {
    setPrecisions((prev) => {
      if (!(iso in prev)) return prev;
      const next = { ...prev };
      delete next[iso];
      return next;
    });
  }

  function paintDay(iso: string, toggle: boolean) {
    let removed = false;
    setDays((prev) => {
      const already = prev[iso];
      const next = { ...prev };
      if (toggle && already === brush) {
        delete next[iso];
        pendingUpsertsRef.current.delete(iso);
        pendingDeletesRef.current.add(iso);
        removed = true;
      } else {
        next[iso] = brush;
        pendingDeletesRef.current.delete(iso);
        pendingUpsertsRef.current.set(iso, brush);
        // Repasser à 0 efface la précision (invariant : contrainte seulement si > 0).
        removed = brush === 0;
      }
      return next;
    });
    if (removed) dropPrecision(iso);
  }

  // Annule le toggle de peinture appliqué au pointerdown (utilisé quand l'appui
  // long prend le relais : préciser un horaire ne doit ni repeindre ni effacer).
  // Restaure aussi la précision, que `paintDay` a pu effacer via le chemin toggle
  // ou le pinceau 0 — sinon la feuille s'ouvrirait avec des horaires vidés.
  function revertDay(iso: string, previousLevel: AvailabilityLevel | undefined, previousPrecision: Precision | undefined) {
    setDays((prev) => {
      const next = { ...prev };
      if (previousLevel === undefined) delete next[iso];
      else next[iso] = previousLevel;
      return next;
    });
    setPrecisions((prev) => {
      const next = { ...prev };
      if (previousPrecision === undefined) delete next[iso];
      else next[iso] = previousPrecision;
      return next;
    });
    pendingUpsertsRef.current.delete(iso);
    pendingDeletesRef.current.delete(iso);
  }

  async function savePrecision(iso: string, from: string | null, until: string | null) {
    if (!userId) return;
    const uid = userId;
    const level = days[iso];
    if (level === undefined || level === 0) return;

    setPrecisions((prev) => {
      const next = { ...prev };
      if (from === null && until === null) delete next[iso];
      else next[iso] = { from, until };
      return next;
    });

    await enqueueWrite(async () => {
      const { error: upsertError } = await supabase.from('availability_declarations').upsert(
        [{ volunteer_id: uid, day: iso, level, available_from: from, available_until: until, updated_at: new Date().toISOString() }],
        { onConflict: 'volunteer_id,day' }
      );
      if (upsertError) setError(`Enregistrement impossible : ${upsertError.message}`);
    });
  }

  async function clearAllDays() {
    if (!userId) return;
    const uid = userId;
    setError(null);
    pendingUpsertsRef.current = new Map();
    pendingDeletesRef.current = new Set();
    setDays({});
    setPrecisions({});
    setSheetIso(null);

    await enqueueWrite(async () => {
      const { error: deleteError } = await supabase
        .from('availability_declarations')
        .delete()
        .eq('volunteer_id', uid)
        .gte('day', fromISO)
        .lt('day', toISO);

      if (deleteError) {
        setError(`Impossible de tout effacer : ${deleteError.message}`);
        await loadDays(uid);
      }
    });
  }

  const filledCount = Object.keys(days).length;
  const precisedCount = useMemo(() => Object.values(precisions).filter((p) => p.from !== null || p.until !== null).length, [precisions]);
  const totalDaysCount = useMemo(() => monthGrids.reduce((sum, grid) => sum + grid.cells.filter(Boolean).length, 0), [monthGrids]);

  const sheetLevel = sheetIso !== null ? days[sheetIso] : undefined;
  const sheetPrecision = sheetIso !== null ? precisions[sheetIso] : undefined;
  const sheetFromHour = timeToHour(sheetPrecision?.from ?? null);
  const sheetUntilHour = timeToHour(sheetPrecision?.until ?? null);

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
        Touche ou glisse pour peindre · appui long pour préciser un horaire
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
                const precised = hasConstraint(precisions[cell.iso]);
                return (
                  <div
                    key={cell.iso}
                    data-testid="availability-day-cell"
                    data-day={cell.iso}
                    onContextMenu={(event) => event.preventDefault()}
                    onPointerDown={
                      cell.isPast
                        ? undefined
                        : (event) => {
                            paintOnRef.current = true;
                            const previousLevel = days[cell.iso];
                            const previousPrecision = precisions[cell.iso];
                            paintDay(cell.iso, true);
                            clearLongPress();
                            longPressStartRef.current = { x: event.clientX, y: event.clientY };
                            longPressTimerRef.current = setTimeout(() => {
                              // Appui long maintenu sans glisser : on annule le toggle
                              // et on ouvre la feuille « Préciser » (jour dispo uniquement).
                              longPressTimerRef.current = null;
                              longPressStartRef.current = null;
                              paintOnRef.current = false;
                              revertDay(cell.iso, previousLevel, previousPrecision);
                              if (previousLevel !== undefined && previousLevel > 0) setSheetIso(cell.iso);
                            }, LONG_PRESS_MS);
                          }
                    }
                    onPointerEnter={
                      cell.isPast
                        ? undefined
                        : (event) => {
                            // Glisser vers une autre cellule annule l'appui long.
                            clearLongPress();
                            // Le tactile ne déclenche pas d'enter en continu (capture implicite du
                            // pointeur) : seul le tap fonctionne, ce qui laisse le scroll natif intact.
                            if (paintOnRef.current && event.pointerType !== 'touch') paintDay(cell.iso, false);
                          }
                    }
                    // Empêche le rappel de menu/sélection natif (iOS surtout) qui, sur
                    // un appui maintenu, déclenchait un `pointercancel` avant les 450 ms.
                    style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
                    className={cn(
                      'relative flex aspect-square select-none items-center justify-center rounded-[9px] border text-[13px]',
                      style
                        ? cn(style.bg, style.text, 'border-transparent font-bold')
                        : cn('border-line font-normal text-ink-3', cell.isWeekend ? 'bg-surface-sub' : 'bg-surface-card'),
                      cell.isPast ? 'opacity-30' : 'cursor-pointer'
                    )}
                  >
                    {cell.dayOfMonth}
                    {precised ? (
                      <span
                        aria-hidden
                        className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
                        style={{ background: level === 3 ? '#FFFFFF' : '#002D74' }}
                      />
                    ) : null}
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
            {precisedCount > 0 ? <span className="text-ink-3"> · {precisedCount} précisé{precisedCount > 1 ? 's' : ''}</span> : null}
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

      {/* Desktop : pas de header sticky global (lg:hidden) — on garde une pastille
          flottante en bas à droite ; sur mobile, la rangée mini vit dans le header. */}
      <div
        aria-hidden={!showMiniBrush}
        className={cn(
          'fixed bottom-6 right-6 z-20 hidden justify-end transition-all duration-200 lg:flex',
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

      {sheetIso !== null && sheetLevel !== undefined && sheetLevel > 0 ? (
        <PreciseSheet
          iso={sheetIso}
          level={sheetLevel}
          fromHour={sheetFromHour}
          untilHour={sheetUntilHour}
          onSelectFrom={(hour) => savePrecision(sheetIso, hour === null ? null : hourToTime(hour), sheetPrecision?.until ?? null)}
          onSelectUntil={(hour) => savePrecision(sheetIso, sheetPrecision?.from ?? null, hour === null ? null : hourToTime(hour))}
          onClear={() => savePrecision(sheetIso, null, null)}
          onClose={() => setSheetIso(null)}
        />
      ) : null}
    </div>
  );
}

function PreciseSheet({
  iso,
  level,
  fromHour,
  untilHour,
  onSelectFrom,
  onSelectUntil,
  onClear,
  onClose
}: {
  iso: string;
  level: AvailabilityLevel;
  fromHour: number | null;
  untilHour: number | null;
  onSelectFrom: (hour: number | null) => void;
  onSelectUntil: (hour: number | null) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  // Le tap résiduel du geste d'appui long qui vient d'ouvrir la feuille retombe
  // sur l'overlay : on l'ignore pendant un court instant pour ne pas la refermer
  // aussitôt (les boutons et Échap, eux, ferment sans délai).
  const openedAtRef = useRef(Date.now());

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const style = AVAILABILITY_LEVEL_STYLES[level];

  return (
    <div
      data-testid="availability-precise-sheet"
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(12,19,38,.45)' }}
      onClick={() => {
        if (Date.now() - openedAtRef.current < 500) return;
        onClose();
      }}
    >
      <div
        className="w-full rounded-t-[20px] bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-[0_-16px_40px_-18px_rgba(12,19,38,.5)] sm:mx-auto sm:mb-6 sm:max-w-[440px] sm:rounded-[20px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-line" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[19px] font-black leading-tight text-ink">{longDate(iso)}</h2>
            <p className="mt-1 text-[13px] text-ink-2">Précision facultative — ça reste une tendance, pas un engagement</p>
          </div>
          <span
            className={cn('shrink-0 rounded-full px-3 py-1.5 text-[13px] font-bold', level === 3 ? 'text-white' : cn(style.bg, style.text))}
            style={level === 3 ? { background: '#059669' } : undefined}
          >
            {level} · {AVAILABILITY_LEVEL_LABELS[level]}
          </span>
        </div>

        <div className="mt-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Dispo à partir de</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {AVAILABILITY_FROM_HOURS.map((hour) => (
              <HourChip key={hour} hour={hour} selected={fromHour === hour} onClick={() => onSelectFrom(fromHour === hour ? null : hour)} />
            ))}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Parti au plus tard à</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {AVAILABILITY_UNTIL_HOURS.map((hour) => (
              <HourChip key={hour} hour={hour} selected={untilHour === hour} onClick={() => onSelectUntil(untilHour === hour ? null : hour)} />
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button variant="ghost" className="min-h-[44px] flex-1" onClick={onClear}>
            Effacer la précision
          </Button>
          <Button variant="primary" className="min-h-[44px] flex-1" onClick={onClose}>
            C&apos;est noté
          </Button>
        </div>
      </div>
    </div>
  );
}

// Rangée compacte affichée dans le header sticky (mobile) quand les gros boutons
// « Je peins avec » sortent de l'écran : 4 carrés couleur + chiffre, même état.
function MiniBrushRow({ brush, onSelect }: { brush: AvailabilityLevel; onSelect: (level: AvailabilityLevel) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Je peins avec</span>
      <div className="flex items-center gap-1.5">
        {LEVELS.map((level) => {
          const selected = brush === level;
          const solid = AVAILABILITY_LEVEL_STYLES[level].solid;
          return (
            <button
              key={level}
              type="button"
              onClick={() => onSelect(level)}
              aria-label={`Peindre avec : ${AVAILABILITY_LEVEL_LABELS[level]}`}
              aria-pressed={selected}
              className={cn(
                'flex h-10 w-11 shrink-0 items-center justify-center rounded-[11px] text-[15px] font-extrabold transition',
                selected ? 'text-white shadow-[0_5px_12px_-5px_rgba(12,19,38,.45)]' : 'border bg-white'
              )}
              style={selected ? { background: solid } : { borderColor: '#E6EAF2', color: solid }}
            >
              {level}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HourChip({ hour, selected, onClick }: { hour: number; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid="availability-hour-chip"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'min-h-[40px] min-w-[52px] rounded-full px-4 text-[14px] font-bold transition',
        selected ? 'text-white' : 'border bg-white'
      )}
      style={
        selected
          ? { background: '#002D74' }
          : { borderColor: '#DCE2EC', color: '#5B6478' }
      }
    >
      {hour}h
    </button>
  );
}
