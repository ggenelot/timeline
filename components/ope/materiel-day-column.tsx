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
    <div className="rounded-[10px] border border-line bg-surface-card p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className={`text-[10px] font-bold uppercase tracking-[0.03em] ${labelClass}`}>{title}</span>
        <span className="rounded-full bg-[#E4E9F2] px-1.5 py-px text-[10px] font-bold text-ink-2">{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-[10.5px] italic text-ink-3">{emptyLabel}</p>
      ) : (
        <div className="flex flex-wrap gap-[5px]">{children}</div>
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
      className={`flex w-[272px] shrink-0 flex-col overflow-hidden rounded-[15px] border bg-surface-sub ${
        isToday ? 'border-accent-ring shadow-[0_0_0_1px_var(--color-accent-ring,#FBDCC4)]' : 'border-line'
      }`}
    >
      <header
        className={`sticky top-0 z-10 flex items-center justify-between border-b px-[13px] py-[9px] text-[13px] font-bold ${
          isToday ? 'border-accent-ring bg-accent-soft text-accent-text' : 'border-line-row bg-surface-card text-ink-2'
        }`}
      >
        <span className="capitalize">{capitalize(label)}</span>
        {isToday ? (
          <span className="rounded-full bg-accent px-[7px] py-0.5 text-[9px] font-extrabold uppercase tracking-[0.03em] text-white">
            AUJ.
          </span>
        ) : null}
      </header>

      <div className="flex flex-1 flex-col gap-[7px] p-2.5">
        <Group title="Engagé" count={engaged.length} labelClass="text-accent-text" emptyLabel="Aucun matériel engagé">
          {engaged.map((m) => (
            <MaterielChip key={m.container_type_id} name={m.name} code={m.code} tone="engaged" />
          ))}
        </Group>
        <Group title="Disponible" count={available.length} labelClass="text-ok-text" emptyLabel="Aucun contenant disponible">
          {available.map((c) => (
            <MaterielChip key={c.id} name={c.name} code={c.code} tone="available" />
          ))}
        </Group>
        <Group title="Indisponible" count={unavailable.length} labelClass="text-ink-3" emptyLabel="Aucun contenant indisponible">
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
