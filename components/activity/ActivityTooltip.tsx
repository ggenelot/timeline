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
      className="pointer-events-none fixed z-50 min-w-52 max-w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl"
      style={{ left: x + 14, top: y - 8 }}
    >
      <p className="font-semibold text-slate-900">{profileName}</p>
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
        <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          {acts.map((act, i) => (
            <li key={i} className="flex items-start justify-between gap-2">
              <span className="text-slate-600">{act.missionTitle}</span>
              <span className="shrink-0 text-slate-400">
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
