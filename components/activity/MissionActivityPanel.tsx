'use client';

import { useMemo, useState } from 'react';
import type { ActivityAct } from '@/lib/types';
import type { Period } from './activity.constants';
import { SEUIL_HOURS } from './activity.constants';
import { useActivityModel } from './useActivityModel';
import { ActivityFilters } from './ActivityFilters';
import { ActivityBarChart } from './ActivityBarChart';
import { ActivityCalendar } from './ActivityCalendar';

type Props = {
  acts: ActivityAct[];
  seuilHours?: number;
  error?: string | null;
};

export function MissionActivityPanel({ acts, seuilHours = SEUIL_HOURS, error = null }: Props) {
  const [view, setView] = useState<'graphe' | 'calendrier'>('graphe');
  const [period, setPeriod] = useState<Period>('12m');
  const [hiddenVols, setHiddenVols] = useState<Set<string>>(new Set());
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

  const model = useActivityModel(acts, period, hiddenVols, hiddenTypes, seuilHours);

  const profileNames = useMemo(
    () => new Map(acts.map((a) => [a.profileId, a.profileName])),
    [acts],
  );

  function toggleVol(id: string) {
    setHiddenVols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleType(name: string) {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
        Impossible de charger l&apos;activité des bénévoles : {error}
      </div>
    );
  }

  if (acts.length === 0) {
    return (
      <p className="py-4 text-sm text-slate-500">
        Aucun bénévole disponible avec une activité sur l&apos;année roulante.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ActivityFilters
        view={view}
        onViewChange={setView}
        period={period}
        onPeriodChange={setPeriod}
        profileIds={model.allProfileIds}
        profileNames={profileNames}
        hiddenVols={hiddenVols}
        onToggleVol={toggleVol}
        typeNames={model.allTypeNames}
        hiddenTypes={hiddenTypes}
        onToggleType={toggleType}
      />

      {view === 'graphe' ? (
        <ActivityBarChart
          rows={model.barRows}
          scaleMax={model.scaleMax}
          ticks={model.ticks}
          seuilPercent={model.seuilPercent}
          seuilHours={seuilHours}
        />
      ) : (
        <ActivityCalendar
          rows={model.calendarRows}
          months={model.months}
          seuilHours={seuilHours}
        />
      )}
    </div>
  );
}
