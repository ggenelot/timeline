import type { MissionStatus } from '@/lib/types';
import { MISSION_STATUS_LABELS, getMissionStatusBadgeClass } from '@/lib/missions';
import { getSkillColorClass } from '@/components/skills/skill-badge';

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
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
      {initials(name)}
    </span>
  );
}

// Pastille de statut de mission (« Validé » mis en avant pour confirmed).
export function StatusBadge({ status }: { status: MissionStatus }) {
  const label = status === 'confirmed' ? 'Validé' : MISSION_STATUS_LABELS[status];
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${getMissionStatusBadgeClass(status)}`}
    >
      {label}
    </span>
  );
}

// Indicateur d'effectif engagé / requis, avec mini-barre de couverture.
export function EffectifBadge({ engaged, required }: { engaged: number; required: number }) {
  const ratio = required > 0 ? Math.min(1, engaged / required) : engaged > 0 ? 1 : 0;
  const tone =
    required > 0 && engaged >= required
      ? { bar: 'bg-emerald-500', text: 'text-emerald-700' }
      : engaged === 0
        ? { bar: 'bg-slate-300', text: 'text-slate-500' }
        : { bar: 'bg-amber-500', text: 'text-amber-700' };
  return (
    <span className="inline-flex items-center gap-1.5" title="Effectif engagé / requis">
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-slate-200">
        <span className={`block h-full ${tone.bar}`} style={{ width: `${ratio * 100}%` }} />
      </span>
      <span className={`text-[11px] font-semibold tabular-nums ${tone.text}`}>
        {engaged}/{required || '—'}
      </span>
    </span>
  );
}

// Puce d'un contenant matériel, colorée par sa catégorie (même palette que les
// compétences). `muted` = grisé barré, pour le matériel indisponible.
export function MaterielChip({
  name,
  code,
  color,
  muted,
  title,
}: {
  name: string;
  code: string | null;
  color: string | null;
  muted?: boolean;
  title?: string;
}) {
  const colorClass = muted ? 'border-slate-200 bg-slate-50 text-slate-400' : getSkillColorClass(color);
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${colorClass}`}
      title={title ?? (code ? `${name} · ${code}` : name)}
    >
      <span className={`truncate ${muted ? 'line-through' : ''}`}>{name}</span>
      {code ? <span className="shrink-0 opacity-60">· {code}</span> : null}
    </span>
  );
}

// Marqueur de conflit d'engagement (⚠️) avec infobulle.
export function ConflictMark({ label }: { label: string }) {
  return (
    <span
      className="cursor-help text-amber-500"
      title={`Conflit d'engagement : ${label}`}
      aria-label={`Conflit d'engagement : ${label}`}
    >
      ⚠️
    </span>
  );
}
