'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import type { OpeDashboardData, OpeMission, RoleBehavior } from '@/lib/types';
import { buildDayAxis, missionDayKey } from '@/lib/mission-timeline';
import { availableNotRetainedByDay, computeVolunteerConflicts, engagedMaterielByDay } from '@/lib/ope-dashboard';
import { DayColumn } from '@/components/ope/day-column';
import { MaterielDayColumn } from '@/components/ope/materiel-day-column';
import { EventDetailModal } from '@/components/ope/event-detail-modal';
import { TypeFilter, type OpeTypeOption } from '@/components/ope/type-filter';
import { PersonSearch } from '@/components/ope/person-search';
import { PersonActivityPanel } from '@/components/ope/person-activity-panel';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const TODAY_KEY = missionDayKey(new Date().toISOString());

export default function OpeDashboardPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OpeDashboardData | null>(null);

  const [days, setDays] = useState<7 | 14>(7);
  const [offsetDays, setOffsetDays] = useState(0);
  const [disabledTypes, setDisabledTypes] = useState<Set<string>>(new Set());
  const [selectedMission, setSelectedMission] = useState<OpeMission | null>(null);
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);

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

  // Données (à chaque changement de fenêtre)
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
      setData((await res.json()) as OpeDashboardData);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [allowed, token, fromISO, days]);

  const allMissions = useMemo(() => data?.missions ?? [], [data]);

  // Types présents (pour le filtre)
  const typeOptions = useMemo<OpeTypeOption[]>(() => {
    const seen = new Map<string, OpeTypeOption>();
    for (const m of allMissions) {
      const name = m.type.name;
      if (name && !seen.has(name)) seen.set(name, { name, color: m.type.color });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [allMissions]);

  const filteredMissions = useMemo(
    () => allMissions.filter((m) => !(m.type.name && disabledTypes.has(m.type.name))),
    [allMissions, disabledTypes]
  );

  const missionsByDay = useMemo(() => {
    const map = new Map<string, OpeMission[]>();
    for (const m of filteredMissions) {
      const key = missionDayKey(m.starts_at);
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return map;
  }, [filteredMissions]);

  // Conflits & dispo calculés sur TOUTES les missions (le filtre n'est qu'une vue).
  const conflicts = useMemo(() => computeVolunteerConflicts(allMissions), [allMissions]);
  const availByDay = useMemo(
    () => availableNotRetainedByDay(allMissions, data?.availability ?? []),
    [allMissions, data]
  );
  // Matériel : engagé calculé sur TOUTES les missions (le filtre par type n'est qu'une vue),
  // dispo/indispo dérivés du catalogue de contenants.
  const engagedMatByDay = useMemo(() => engagedMaterielByDay(allMissions), [allMissions]);
  const containers = useMemo(() => data?.containers ?? [], [data]);

  const dayAxis = useMemo(() => buildDayAxis(fromISO, days), [fromISO, days]);

  function toggleType(name: string) {
    setDisabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

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

  const btn = 'rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50';

  return (
    // Full-bleed par marges (pas de transform, sinon il deviendrait le bloc conteneur
    // des modales `fixed`) : on sort du gabarit max-w-4xl du shell pour prendre toute la largeur.
    // `overflow-x-clip` neutralise le léger débordement dû à 100vw sans casser le sticky.
    <div className="mx-[calc(50%_-_50vw)] w-screen overflow-x-clip px-3 sm:px-6 lg:px-10">
      {/* breadcrumb + titre */}
      <div className="mb-3 text-xs font-semibold text-slate-400">
        OPE <span className="text-slate-300">›</span> <span className="text-slate-500">Tableau de bord</span>
      </div>
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Tableau de bord OPE</h1>
        <p className="mt-1 text-sm text-slate-500">
          Suivi de l&apos;engagement des moyens et des personnes sur les prochains jours.
        </p>
      </div>

      {/* Toolbar sticky */}
      <div className="sticky top-0 z-20 -mx-3 mb-4 border-b border-slate-200 bg-slate-50/95 px-3 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setOffsetDays((o) => o - days)} className={btn}>
            ← Précédent
          </button>
          <button type="button" onClick={() => setOffsetDays(0)} className={btn}>
            Aujourd&apos;hui
          </button>
          <button type="button" onClick={() => setOffsetDays((o) => o + days)} className={btn}>
            Suivant →
          </button>
          <span className="ml-1 text-sm font-medium text-slate-600">{rangeLabel}</span>

          <div className="ml-auto flex items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
              {([7, 14] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={`px-3 py-1 text-sm ${
                    days === d ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {d} j
                </button>
              ))}
            </div>
            <PersonSearch
              volunteers={data?.volunteers ?? []}
              value={person?.id ?? ''}
              onSelect={(id) => {
                const v = (data?.volunteers ?? []).find((x) => x.id === id);
                if (v) setPerson({ id: v.id, name: v.full_name ?? 'Bénévole' });
              }}
            />
          </div>
        </div>

        {typeOptions.length > 0 ? (
          <div className="mt-2">
            <TypeFilter types={typeOptions} disabled={disabledTypes} onToggle={toggleType} />
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {/* Board */}
      {loading && !data ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: days }).map((_, i) => (
            <div key={i} className="h-64 w-72 shrink-0 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3" style={{ minWidth: 'min-content' }}>
            {dayAxis.map((day) => (
              <DayColumn
                key={day.key}
                label={day.label}
                dateISO={day.dateISO}
                missions={missionsByDay.get(day.key) ?? []}
                conflicts={conflicts}
                availableNotRetained={availByDay.get(day.key) ?? []}
                isToday={day.key === TODAY_KEY}
                onOpen={setSelectedMission}
              />
            ))}
          </div>
        </div>
      )}

      {/* Matériel — engagé / disponible / indisponible par jour */}
      <section className="mt-8">
        <h2 className="text-lg font-bold text-slate-900">Matériel par jour</h2>
        <p className="mb-3 mt-1 text-sm text-slate-500">
          Contenants engagés sur les activités, disponibles, et indisponibles (hors service) sur la période.
        </p>
        {!loading && containers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
            Aucun contenant dans le catalogue. Ajoutez des contenants dans « Matériel » pour suivre leur engagement.
          </p>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-3" style={{ minWidth: 'min-content' }}>
              {dayAxis.map((day) => {
                const engaged = engagedMatByDay.get(day.key) ?? [];
                const engagedIds = new Set(engaged.map((m) => m.container_type_id));
                const unavailable = containers.filter((c) => !c.is_available && !engagedIds.has(c.id));
                const available = containers.filter((c) => c.is_available && !engagedIds.has(c.id));
                return (
                  <MaterielDayColumn
                    key={day.key}
                    label={day.label}
                    isToday={day.key === TODAY_KEY}
                    engaged={engaged}
                    available={available}
                    unavailable={unavailable}
                  />
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Modale fiche poste */}
      {selectedMission ? (
        <EventDetailModal
          mission={selectedMission}
          availability={data?.availability ?? []}
          onClose={() => setSelectedMission(null)}
        />
      ) : null}

      {/* Panneau activités d'une personne */}
      {person ? (
        <PersonActivityPanel
          volunteerId={person.id}
          volunteerName={person.name}
          token={token}
          onClose={() => setPerson(null)}
        />
      ) : null}
    </div>
  );
}
