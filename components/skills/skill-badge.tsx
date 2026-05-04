import { Skill } from '@/lib/types';

type SkillBadgeProps = {
  name: string;
  category?: Skill['category'];
};

function getSkillBadgeClass(skillCategory: Skill['category']): string {
  const baseClass = 'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium';

  switch (skillCategory) {
    case 'formation':
      return `${baseClass} border-sky-300 bg-sky-50 text-sky-900`;
    case 'accso':
      return `${baseClass} border-violet-300 bg-violet-50 text-violet-900`;
    case 'operationnel':
      return `${baseClass} border-amber-300 bg-amber-50 text-amber-900`;
    case 'conduite':
      return `${baseClass} border-emerald-300 bg-emerald-50 text-emerald-900`;
    case 'technique':
      return `${baseClass} border-slate-300 bg-slate-100 text-slate-900`;
    default:
      return `${baseClass} border-slate-300 bg-slate-100 text-slate-900`;
  }
}

export function SkillBadge({ name, category = null }: SkillBadgeProps) {
  return <span className={getSkillBadgeClass(category)}>{name}</span>;
}

export { getSkillBadgeClass };
