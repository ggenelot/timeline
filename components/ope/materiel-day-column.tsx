'use client';

import type { OpeContainer, OpeEngagedMateriel } from '@/lib/types';
import { capitalize, MaterielChip } from '@/components/ope/atoms';

function Group({
  title,
  count,
  labelClass,
  children,
  emptyLabel,
}: {
  title: string;
  count: number;
  labelClass: string;
  children: React.ReactNode;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white/60 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${labelClass}`}>{title}</span>
        <span className="rounded-full bg-slate-200 px-1.5 text-[11px] font-medium text-slate-600">{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-[11px] italic text-slate-400">{emptyLabel}</p>
      ) : (
        <div className="flex flex-wrap gap-1">{children}</div>
      )}
    </div>
  );
}

// Une colonne « matériel » d'un jour : contenants engagés / disponibles /
// indisponibles, en miroir des colonnes secouristes du board.
export function MaterielDayColumn({
  label,
  isToday,
  engaged,
  available,
  unavailable,
}: {
  label: string;
  isToday: boolean;
  engaged: OpeEngagedMateriel[];
  available: OpeContainer[];
  unavailable: OpeContainer[];
}) {
  return (
    <section
      className={`flex w-72 shrink-0 flex-col rounded-xl border ${
        isToday ? 'border-sky-300 ring-1 ring-sky-200' : 'border-slate-200'
      } bg-slate-50`}
    >
      <header
        className={`sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b px-3 py-2 ${
          isToday ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-white/90 backdrop-blur'
        }`}
      >
        <span className="text-sm font-semibold capitalize text-slate-700">{capitalize(label)}</span>
        {isToday ? (
          <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
            Aujourd&apos;hui
          </span>
        ) : null}
      </header>

      <div className="flex flex-1 flex-col gap-2 p-2">
        <Group title="Engagé" count={engaged.length} labelClass="text-orange-600" emptyLabel="Aucun matériel engagé">
          {engaged.map((m) => (
            <MaterielChip key={m.container_type_id} name={m.name} code={m.code} tone="engaged" />
          ))}
        </Group>
        <Group title="Disponible" count={available.length} labelClass="text-emerald-600" emptyLabel="Aucun contenant disponible">
          {available.map((c) => (
            <MaterielChip key={c.id} name={c.name} code={c.code} tone="available" />
          ))}
        </Group>
        <Group title="Indisponible" count={unavailable.length} labelClass="text-slate-400" emptyLabel="Aucun contenant indisponible">
          {unavailable.map((c) => (
            <MaterielChip
              key={c.id}
              name={c.name}
              code={c.code}
              tone="unavailable"
              title={c.unavailable_reason || 'Indisponible'}
            />
          ))}
        </Group>
      </div>
    </section>
  );
}
