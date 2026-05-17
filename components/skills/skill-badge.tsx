const COLOR_CLASSES: Record<string, string> = {
  slate:   'border-slate-400 bg-slate-200 text-slate-800',
  amber:   'border-amber-300 bg-amber-50 text-amber-900',
  sky:     'border-sky-300 bg-sky-50 text-sky-900',
  violet:  'border-violet-300 bg-violet-50 text-violet-900',
  emerald: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  pink:    'border-pink-300 bg-pink-50 text-pink-900',
  rose:    'border-rose-300 bg-rose-50 text-rose-900',
  orange:  'border-orange-300 bg-orange-50 text-orange-900',
  cyan:    'border-cyan-300 bg-cyan-50 text-cyan-900',
  indigo:  'border-indigo-300 bg-indigo-50 text-indigo-900',
};

export function getSkillColorClass(color: string | null | undefined): string {
  return COLOR_CLASSES[color ?? ''] ?? COLOR_CLASSES.slate;
}

export function SkillBadge({ name, color }: { name: string; color?: string | null }) {
  const colorClass = getSkillColorClass(color);
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {name}
    </span>
  );
}
