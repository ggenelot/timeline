import type { MissionStatus } from '@/lib/types';
import { MISSION_STATUS_LABELS, getMissionStatusBadgeClass } from '@/lib/missions';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

export function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

export function initials(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatTimeRange(startISO: string, endISO: string): string {
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  return `${new Date(startISO).toLocaleTimeString('fr-FR', opts)} – ${new Date(endISO).toLocaleTimeString('fr-FR', opts)}`;
}

// Pastille d'initiales d'un secouriste.
export function Avatar({ name }: { name: string | null }) {
  return (
    <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#E4E8F0] text-[10px] font-semibold text-ink-2">
      {initials(name)}
    </span>
  );
}

// Pastille de statut de mission (« Validé » mis en avant pour confirmed).
export function StatusBadge({ status }: { status: MissionStatus }) {
  const label = status === 'confirmed' ? 'Validé' : MISSION_STATUS_LABELS[status];
  return (
    <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold', getMissionStatusBadgeClass(status))}>
      {label}
    </span>
  );
}

// Indicateur d'effectif engagé / requis, avec mini-barre de couverture (40×6px).
export function EffectifBadge({ engaged, required }: { engaged: number; required: number }) {
  const ratio = required > 0 ? Math.min(1, engaged / required) : engaged > 0 ? 1 : 0;
  const tone =
    required > 0 && engaged >= required
      ? { bar: 'bg-ok-bar', text: 'text-ok-text' }
      : engaged === 0
        ? { bar: 'bg-ink-4', text: 'text-ink-3' }
        : { bar: 'bg-warn-bar', text: 'text-warn-text' };
  return (
    <span className="inline-flex items-center gap-1.5" title="Effectif engagé / requis">
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-line">
        <span className={cn('block h-full transition-[width] duration-300', tone.bar)} style={{ width: `${ratio * 100}%` }} />
      </span>
      <span className={cn('text-[11px] font-semibold tabular-nums', tone.text)}>
        {engaged}/{required || '—'}
      </span>
    </span>
  );
}

// Puce d'un contenant matériel, colorée par son STATUT opérationnel :
//  - engaged     → orange (engagé sur une activité)
//  - available   → vert (disponible)
//  - unavailable → gris barré (hors service)
export type MaterielChipTone = 'engaged' | 'available' | 'unavailable';

const MATERIEL_TONE_CLASS: Record<MaterielChipTone, string> = {
  engaged: 'border-accent-ring bg-accent-soft text-accent-text',
  available: 'border-ok-line bg-ok-soft text-ok-text',
  unavailable: 'border-line bg-surface-sub text-ink-3',
};

export function MaterielChip({
  name,
  code,
  tone,
  title,
}: {
  name: string;
  code: string | null;
  tone: MaterielChipTone;
  title?: string;
}) {
  return (
    <span
      className={cn('inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', MATERIEL_TONE_CLASS[tone])}
      title={title ?? (code ? `${name} · ${code}` : name)}
    >
      <span className={cn('truncate', tone === 'unavailable' && 'line-through')}>{name}</span>
      {code ? <span className="shrink-0 opacity-60">· {code}</span> : null}
    </span>
  );
}

// Marqueur de conflit d'engagement (icône warning ambre) avec infobulle.
export function ConflictMark({ label }: { label: string }) {
  return (
    <span
      className="inline-flex cursor-help items-center text-warn-bar"
      title={`Conflit d'engagement : ${label}`}
      aria-label={`Conflit d'engagement : ${label}`}
    >
      <Icon name="warning" size={15} />
    </span>
  );
}
