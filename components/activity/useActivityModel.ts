'use client';

import { useMemo } from 'react';
import type { ActivityAct } from '@/lib/types';
import type { Period } from './activity.constants';
import { SEUIL_HOURS, getVolunteerColor } from './activity.constants';

function getPeriodStart(period: Period): Date {
  const now = new Date();
  switch (period) {
    case '1m': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d;
    }
    case '3m': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return d;
    }
    case '6m': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      return d;
    }
    case '12m': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 12);
      return d;
    }
    case 'ytd':
      return new Date(now.getFullYear(), 0, 1);
  }
}

export type BarSegment = {
  profileId: string;
  profileName: string;
  hours: number;
  sharePercent: number;
  color: string;
  acts: { missionTitle: string; missionDate: string; hours: number }[];
};

export type BarRow = {
  typeName: string;
  totalHours: number;
  segments: BarSegment[];
};

export type CalendarCell = {
  hours: number;
  acts: { missionTitle: string; missionDate: string; hours: number; typeName: string }[];
};

export type CalendarRow = {
  profileId: string;
  profileName: string;
  totalHours: number;
  overSeuil: boolean;
  cells: CalendarCell[];
};

export type ActivityModel = {
  barRows: BarRow[];
  scaleMax: number;
  ticks: number[];
  seuilPercent: number;
  months: Date[];
  calendarRows: CalendarRow[];
  allProfileIds: string[];
  allTypeNames: string[];
};

export function useActivityModel(
  acts: ActivityAct[],
  period: Period,
  hiddenVols: Set<string>,
  hiddenTypes: Set<string>,
  seuil: number = SEUIL_HOURS,
): ActivityModel {
  return useMemo(() => {
    const periodStart = getPeriodStart(period);

    const filtered = acts.filter(
      (act) =>
        new Date(act.missionDate) >= periodStart &&
        !hiddenVols.has(act.profileId) &&
        !hiddenTypes.has(act.typeName),
    );

    const allProfileIds = [...new Set(acts.map((a) => a.profileId))];
    const allTypeNames = [...new Set(acts.map((a) => a.typeName))];

    // --- Bar chart ---
    const typeMap = new Map<string, Map<string, { hours: number; acts: BarSegment['acts'] }>>();
    for (const act of filtered) {
      if (!typeMap.has(act.typeName)) typeMap.set(act.typeName, new Map());
      const volMap = typeMap.get(act.typeName)!;
      if (!volMap.has(act.profileId)) volMap.set(act.profileId, { hours: 0, acts: [] });
      const entry = volMap.get(act.profileId)!;
      entry.hours += act.hours;
      entry.acts.push({ missionTitle: act.missionTitle, missionDate: act.missionDate, hours: act.hours });
    }

    const barRows: BarRow[] = [];
    for (const [typeName, volMap] of typeMap.entries()) {
      const totalHours = [...volMap.values()].reduce((sum, v) => sum + v.hours, 0);
      const segments: BarSegment[] = [...volMap.entries()].map(([profileId, data]) => ({
        profileId,
        profileName: acts.find((a) => a.profileId === profileId)?.profileName ?? 'Bénévole',
        hours: data.hours,
        sharePercent: totalHours > 0 ? (data.hours / totalHours) * 100 : 0,
        color: getVolunteerColor(profileId),
        acts: data.acts,
      }));
      barRows.push({ typeName, totalHours, segments });
    }

    const maxHours = barRows.reduce((m, r) => Math.max(m, r.totalHours), 0);
    const scaleMax = Math.max(Math.ceil(maxHours / 20) * 20, 80);
    const ticks: number[] = [];
    for (let t = 0; t <= scaleMax; t += 20) ticks.push(t);
    const seuilPercent = Math.min((seuil / scaleMax) * 100, 100);

    // --- Calendar ---
    const now = new Date();
    const months: Date[] = [];
    const cur = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1);
    while (cur <= now) {
      months.push(new Date(cur));
      cur.setMonth(cur.getMonth() + 1);
    }

    const calendarRows: CalendarRow[] = allProfileIds
      .filter((pid) => !hiddenVols.has(pid))
      .map((profileId) => {
        const profileName = acts.find((a) => a.profileId === profileId)?.profileName ?? 'Bénévole';
        const cells: CalendarCell[] = months.map((monthStart) => {
          const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59);
          const monthActs = filtered.filter((act) => {
            const d = new Date(act.missionDate);
            return act.profileId === profileId && d >= monthStart && d <= monthEnd;
          });
          return {
            hours: monthActs.reduce((sum, a) => sum + a.hours, 0),
            acts: monthActs.map((a) => ({
              missionTitle: a.missionTitle,
              missionDate: a.missionDate,
              hours: a.hours,
              typeName: a.typeName,
            })),
          };
        });

        const totalHours = cells.reduce((sum, c) => sum + c.hours, 0);
        return { profileId, profileName, totalHours, overSeuil: totalHours > seuil, cells };
      });

    return { barRows, scaleMax, ticks, seuilPercent, months, calendarRows, allProfileIds, allTypeNames };
  }, [acts, period, hiddenVols, hiddenTypes, seuil]);
}
