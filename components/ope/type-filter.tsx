'use client';

import { resolveMissionTypeColor } from '@/lib/mission-timeline';

export type OpeTypeOption = { name: string; color: string | null };

export function TypeFilter({
  types,
  disabled,
  onToggle,
}: {
  types: OpeTypeOption[];
  disabled: Set<string>;
  onToggle: (name: string) => void;
}) {
  if (types.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {types.map((type) => {
        const isOff = disabled.has(type.name);
        const color = resolveMissionTypeColor(type.name, type.color);
        return (
          <button
            key={type.name}
            type="button"
            onClick={() => onToggle(type.name)}
            aria-pressed={!isOff}
            className={`inline-flex items-center gap-[7px] rounded-full border px-[13px] py-1.5 text-[12.5px] font-semibold transition ${
              isOff
                ? 'border-line bg-surface-sub text-ink-3 line-through'
                : 'border-line-field bg-surface-card text-ink hover:bg-surface-sub'
            }`}
          >
            <span
              className="h-[9px] w-[9px] rounded-full"
              style={{ backgroundColor: isOff ? '#A6AEBE' : color }}
            />
            {type.name}
          </button>
        );
      })}
    </div>
  );
}
