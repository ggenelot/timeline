'use client';

import { useState } from 'react';
import type { BarRow } from './useActivityModel';
import { ActivityTooltip } from './ActivityTooltip';

type Props = {
  rows: BarRow[];
  scaleMax: number;
  ticks: number[];
  seuilPercent: number;
  seuilHours: number;
};

type TooltipState = {
  x: number;
  y: number;
  profileName: string;
  typeName: string;
  hours: number;
  sharePercent: number;
  acts: { missionTitle: string; missionDate: string; hours: number }[];
} | null;

export function ActivityBarChart({ rows, scaleMax, ticks, seuilPercent, seuilHours }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        Aucune activité sur la période.
      </p>
    );
  }

  return (
    <div className="relative select-none" onMouseLeave={() => setTooltip(null)}>
      {/* Axe ticks */}
      <div className="relative mb-2 ml-36 h-4" aria-hidden="true">
        {ticks.map((tick) => (
          <span
            key={tick}
            className="absolute -translate-x-1/2 text-[10px] text-slate-400"
            style={{ left: `${(tick / scaleMax) * 100}%` }}
          >
            {tick}h
          </span>
        ))}
      </div>

      {/* Barres */}
      <div className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.typeName} className="flex items-center gap-2">
            <span
              className="w-36 shrink-0 truncate text-right text-xs text-slate-600"
              title={row.typeName}
            >
              {row.typeName}
            </span>
            <div className="relative flex h-7 min-w-0 flex-1 overflow-hidden rounded bg-slate-100">
              {/* Repère seuil */}
              <div
                aria-label={`Seuil ${seuilHours}h`}
                className="pointer-events-none absolute top-0 z-10 h-full border-l-2 border-dashed border-orange-400"
                style={{ left: `${seuilPercent}%` }}
              />
              {/* Segments */}
              {row.segments.map((seg) => (
                <button
                  key={seg.profileId}
                  type="button"
                  style={{ width: `${(seg.hours / scaleMax) * 100}%`, background: seg.color }}
                  className="h-full shrink-0 transition-opacity hover:opacity-75 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                  aria-label={`${seg.profileName} — ${row.typeName} — ${seg.hours.toFixed(1)}h (${seg.sharePercent.toFixed(0)}% de la typologie)`}
                  onMouseMove={(e) =>
                    setTooltip({
                      x: e.clientX,
                      y: e.clientY,
                      profileName: seg.profileName,
                      typeName: row.typeName,
                      hours: seg.hours,
                      sharePercent: seg.sharePercent,
                      acts: seg.acts,
                    })
                  }
                  onFocus={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltip({
                      x: rect.left,
                      y: rect.top,
                      profileName: seg.profileName,
                      typeName: row.typeName,
                      hours: seg.hours,
                      sharePercent: seg.sharePercent,
                      acts: seg.acts,
                    });
                  }}
                  onBlur={() => setTooltip(null)}
                />
              ))}
            </div>
            <span className="w-12 shrink-0 text-xs text-slate-500">{row.totalHours.toFixed(1)}h</span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-orange-500">
        <span aria-hidden="true">— </span>
        Seuil {seuilHours}h
      </p>

      {tooltip ? (
        <ActivityTooltip
          x={tooltip.x}
          y={tooltip.y}
          profileName={tooltip.profileName}
          typeName={tooltip.typeName}
          hours={tooltip.hours}
          sharePercent={tooltip.sharePercent}
          acts={tooltip.acts}
        />
      ) : null}
    </div>
  );
}
