'use client';

import type { OpeAvailabilityEntry, OpeMission } from '@/lib/types';
import type { ConflictInfo } from '@/lib/ope-dashboard';
import { EventCard } from '@/components/ope/event-card';
import { Avatar, capitalize } from '@/components/ope/atoms';
import { cn } from '@/lib/cn';

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
  return (
    <section className="flex w-[272px] shrink-0 flex-col gap-[9px]">
      <header className="sticky top-0 z-10 flex items-center justify-between px-0.5 py-1">
        <div className="flex items-center gap-[7px]">
          {isToday ? (
            <>
              <span className="rounded-lg bg-accent px-2.5 py-[3px] text-[12px] font-bold capitalize text-white">
                {capitalize(label)}
              </span>
              <span className="text-[11px] font-extrabold uppercase tracking-[0.03em] text-accent">AUJ.</span>
            </>
          ) : (
            <span className="text-[13.5px] font-bold capitalize text-ink">{capitalize(label)}</span>
          )}
        </div>
        {missions.length > 0 ? (
          <span
            className={cn(
              'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
              isToday ? 'bg-accent-soft text-accent-text' : 'bg-[#E4E9F2] text-ink-2'
            )}
          >
            {missions.length}
          </span>
        ) : null}
      </header>

      <div className="flex flex-1 flex-col gap-[9px]">
        {missions.length === 0 ? (
          <div className="flex h-[88px] items-center justify-center rounded-[15px] border-[1.5px] border-dashed border-[#DDE3EC] text-[12.5px] font-semibold text-ink-4">
            Rien de prévu
          </div>
        ) : (
          missions.map((mission) => (
            <EventCard key={mission.id} mission={mission} conflicts={conflicts} onOpen={onOpen} />
          ))
        )}

        {/* Secouristes dispo mais non retenus ce jour-là */}
        {availableNotRetained.length > 0 ? (
          <div className="mt-1 rounded-[10px] border border-dashed border-line-field bg-surface-sub p-2">
            <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.04em] text-ink-3">
              Dispo non retenus ({availableNotRetained.length})
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {availableNotRetained.map((entry) => (
                <li
                  key={entry.volunteer_id}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-card py-0.5 pl-0.5 pr-2"
                  title={entry.full_name ?? 'Bénévole'}
                >
                  <Avatar name={entry.full_name} avatarUrl={entry.avatar_url} />
                  <span className="max-w-[8rem] truncate text-[11px] text-ink-2">
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
