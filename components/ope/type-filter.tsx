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
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              isOff
                ? 'border-slate-200 bg-slate-50 text-slate-400 line-through'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: isOff ? '#cbd5e1' : color }}
            />
            {type.name}
          </button>
        );
      })}
    </div>
  );
}
