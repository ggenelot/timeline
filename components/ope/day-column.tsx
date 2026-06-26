'use client';

import type { OpeAvailabilityEntry, OpeMission } from '@/lib/types';
import type { ConflictInfo } from '@/lib/ope-dashboard';
import { EventCard } from '@/components/ope/event-card';
import { Avatar, capitalize } from '@/components/ope/atoms';

export function DayColumn({
  label,
  dateISO,
  missions,
  conflicts,
  availableNotRetained,
  isToday,
  onOpen,
}: {
  label: string;
  dateISO: string;
  missions: OpeMission[];
  conflicts: Map<string, ConflictInfo>;
  availableNotRetained: OpeAvailabilityEntry[];
  isToday: boolean;
  onOpen: (mission: OpeMission) => void;
}) {
  const weekday = new Date(dateISO).getDay();
  const isWeekend = weekday === 0 || weekday === 6;

  return (
    <section
      className={`flex w-72 shrink-0 flex-col rounded-xl border ${
        isToday ? 'border-sky-300 ring-1 ring-sky-200' : 'border-slate-200'
      } ${isWeekend ? 'bg-slate-100/70' : 'bg-slate-50'}`}
    >
      <header
        className={`sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b px-3 py-2 ${
          isToday ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-white/90 backdrop-blur'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold capitalize text-slate-700">{capitalize(label)}</span>
          {isToday ? (
            <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
              Aujourd&apos;hui
            </span>
          ) : null}
        </div>
        {missions.length > 0 ? (
          <span className="rounded-full bg-slate-200 px-1.5 text-xs font-medium text-slate-600">{missions.length}</span>
        ) : null}
      </header>

      <div className="flex flex-1 flex-col gap-2 p-2">
        {missions.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 px-2 py-6 text-center text-xs text-slate-400">
            Aucun événement
          </p>
        ) : (
          missions.map((mission) => (
            <EventCard key={mission.id} mission={mission} conflicts={conflicts} onOpen={onOpen} />
          ))
        )}

        {/* Secouristes dispo mais non retenus ce jour-là */}
        {availableNotRetained.length > 0 ? (
          <div className="mt-1 rounded-md border border-dashed border-slate-300 bg-white/60 p-2">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Dispo non retenus ({availableNotRetained.length})
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {availableNotRetained.map((entry) => (
                <li
                  key={entry.volunteer_id}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2"
                  title={entry.full_name ?? 'Bénévole'}
                >
                  <Avatar name={entry.full_name} />
                  <span className="max-w-[8rem] truncate text-[11px] text-slate-600">
                    {entry.full_name ?? 'Bénévole'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
