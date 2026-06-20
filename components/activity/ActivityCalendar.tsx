'use client';

import { useState } from 'react';
import type { CalendarRow } from './useActivityModel';
import { ActivityTooltip } from './ActivityTooltip';
import { getTypeColor } from './activity.constants';

type Props = {
  rows: CalendarRow[];
  months: Date[];
  seuilHours: number;
};

type TooltipState = {
  x: number;
  y: number;
  profileName: string;
  hours: number;
  acts: { missionTitle: string; missionDate: string; hours: number; typeName: string }[];
} | null;

const MONTH_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

export function ActivityCalendar({ rows, months, seuilHours }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        Aucune activité sur la période.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto" onMouseLeave={() => setTooltip(null)}>
      <table className="min-w-full border-separate border-spacing-x-0 border-spacing-y-0.5 text-xs">
        <thead>
          <tr>
            <th className="w-32 pb-2 pr-3 text-right font-normal text-slate-500">Bénévole</th>
            {months.map((m) => (
              <th
                key={m.toISOString()}
                className="min-w-[56px] pb-2 text-center font-medium text-slate-600"
              >
                {MONTH_FR[m.getMonth()]}
                <br />
                <span className="font-normal text-slate-400">{String(m.getFullYear()).slice(2)}</span>
              </th>
            ))}
            <th className="pb-2 pl-3 text-center font-medium text-slate-600">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.profileId}>
              <td
                className="max-w-[8rem] truncate py-1 pr-3 text-right font-medium text-slate-700"
                title={row.profileName}
              >
                {row.profileName}
              </td>
              {row.cells.map((cell, i) => (
                <td key={i} className="px-0.5 py-1">
                  {cell.acts.length > 0 ? (
                    <button
                      type="button"
                      className="w-full rounded p-1 text-center hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                      aria-label={`${row.profileName} — ${MONTH_FR[months[i]?.getMonth() ?? 0]} — ${cell.hours.toFixed(1)}h`}
                      onMouseMove={(e) =>
                        setTooltip({ x: e.clientX, y: e.clientY, profileName: row.profileName, hours: cell.hours, acts: cell.acts })
                      }
                      onFocus={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({ x: rect.left, y: rect.top, profileName: row.profileName, hours: cell.hours, acts: cell.acts });
                      }}
                      onBlur={() => setTooltip(null)}
                    >
                      <div className="flex flex-col gap-0.5">
                        {cell.acts.map((act, j) => (
                          <div
                            key={j}
                            className="truncate rounded-sm px-0.5 text-[9px] leading-4 text-white"
                            style={{ background: getTypeColor(act.typeName) }}
                          >
                            {act.hours}h
                          </div>
                        ))}
                      </div>
                      <span className="mt-0.5 block text-[10px] text-slate-500">{cell.hours.toFixed(0)}h</span>
                    </button>
                  ) : (
                    <div className="py-1 text-center text-[10px] text-slate-300">—</div>
                  )}
                </td>
              ))}
              <td className="py-1 pl-3 text-center">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
                    row.overSeuil ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {row.totalHours.toFixed(0)}h
                  {row.overSeuil ? (
                    <span aria-label={`Seuil ${seuilHours}h dépassé`} title={`Seuil ${seuilHours}h dépassé`}>
                      ⚠
                    </span>
                  ) : null}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {tooltip ? (
        <ActivityTooltip
          x={tooltip.x}
          y={tooltip.y}
          profileName={tooltip.profileName}
          hours={tooltip.hours}
          acts={tooltip.acts}
        />
      ) : null}
    </div>
  );
}
