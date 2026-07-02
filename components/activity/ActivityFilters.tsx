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
        <div className="inline-flex rounded-lg border border-line bg-surface-sub p-0.5 text-sm">
          {(['graphe', 'calendrier'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => onViewChange(v)}
              className={`rounded-md px-3 py-1 font-medium transition ${
                view === v
                  ? 'bg-surface-card text-ink shadow-sm'
                  : 'text-ink-3 hover:text-ink'
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
                  ? 'border-ok-line bg-ok-soft text-ok-text'
                  : 'border-line bg-surface-card text-ink-2 hover:bg-surface-sub'
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
                    ? 'border-line bg-surface-card text-ink-3 line-through'
                    : 'border-line-field bg-surface-card text-ink-2 hover:bg-surface-sub'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: hidden ? '#A6AEBE' : getVolunteerColor(pid) }}
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
                    ? 'border-line bg-surface-card text-ink-3 line-through'
                    : 'border-line-field bg-surface-card text-ink-2 hover:bg-surface-sub'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: hidden ? '#A6AEBE' : getTypeColor(typeName) }}
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
