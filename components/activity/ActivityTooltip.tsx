'use client';

import { getTypeColor } from './activity.constants';

type Act = { missionTitle: string; missionDate: string; hours: number; typeName?: string };

type Props = {
  x: number;
  y: number;
  profileName: string;
  typeName?: string;
  hours: number;
  sharePercent?: number;
  acts: Act[];
};

export function ActivityTooltip({ x, y, profileName, typeName, hours, sharePercent, acts }: Props) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 min-w-52 max-w-72 rounded-lg border border-line bg-surface-card p-3 text-xs text-ink-2 shadow-lift"
      style={{ left: x + 14, top: y - 8 }}
    >
      <p className="font-semibold text-ink">{profileName}</p>
      {typeName ? (
        <p className="mt-0.5 flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: getTypeColor(typeName) }}
          />
          {typeName}
        </p>
      ) : null}
      <p className="mt-1 font-medium">
        {hours.toFixed(1)} h{sharePercent !== undefined ? ` · ${sharePercent.toFixed(0)} %` : ''}
      </p>
      {acts.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-line-row pt-2">
          {acts.map((act, i) => (
            <li key={i} className="flex items-start justify-between gap-2">
              <span className="text-ink-2">{act.missionTitle}</span>
              <span className="shrink-0 text-ink-3">
                {new Date(act.missionDate).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                {' · '}
                {act.hours}h
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
