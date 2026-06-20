'use client';

import type { Period } from './activity.constants';
import { PERIOD_OPTIONS, getVolunteerColor, getTypeColor } from './activity.constants';

type Props = {
  view: 'graphe' | 'calendrier';
  onViewChange: (v: 'graphe' | 'calendrier') => void;
  period: Period;
  onPeriodChange: (p: Period) => void;
  profileIds: string[];
  profileNames: Map<string, string>;
  hiddenVols: Set<string>;
  onToggleVol: (id: string) => void;
  typeNames: string[];
  hiddenTypes: Set<string>;
  onToggleType: (name: string) => void;
};

export function ActivityFilters({
  view, onViewChange,
  period, onPeriodChange,
  profileIds, profileNames, hiddenVols, onToggleVol,
  typeNames, hiddenTypes, onToggleType,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        {/* Vue switch */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-sm">
          {(['graphe', 'calendrier'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => onViewChange(v)}
              className={`rounded-md px-3 py-1 font-medium transition ${
                view === v
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {v === 'graphe' ? 'Graphe' : 'Calendrier'}
            </button>
          ))}
        </div>

        {/* Période */}
        <div className="flex flex-wrap gap-1.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={period === opt.value}
              onClick={() => onPeriodChange(opt.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                period === opt.value
                  ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chips bénévoles (légende graphe : couleur = bénévole) */}
      {profileIds.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {profileIds.map((pid) => {
            const hidden = hiddenVols.has(pid);
            const name = profileNames.get(pid) ?? 'Bénévole';
            return (
              <button
                key={pid}
                type="button"
                aria-pressed={!hidden}
                onClick={() => onToggleVol(pid)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                  hidden
                    ? 'border-slate-200 bg-white text-slate-400 line-through'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: hidden ? '#cbd5e1' : getVolunteerColor(pid) }}
                />
                {name}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Chips typologies (légende calendrier : couleur = type) */}
      {typeNames.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {typeNames.map((typeName) => {
            const hidden = hiddenTypes.has(typeName);
            return (
              <button
                key={typeName}
                type="button"
                aria-pressed={!hidden}
                onClick={() => onToggleType(typeName)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                  hidden
                    ? 'border-slate-200 bg-white text-slate-400 line-through'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: hidden ? '#cbd5e1' : getTypeColor(typeName) }}
                />
                {typeName}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
