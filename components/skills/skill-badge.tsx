import { Skill } from '@/lib/types';

type SkillBadgeProps = {
  name: string;
  category?: Skill['category'];
};

function getSkillBadgeClass(skillCategory: Skill['category']): string {
  const baseClass = 'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium';

  switch (skillCategory) {
    case 'formation':
      return `${baseClass} border-sky-200 bg-sky-50 text-sky-800`;
    case 'accso':
      return `${baseClass} border-violet-200 bg-violet-50 text-violet-800`;
    case 'operationnel':
      return `${baseClass} border-amber-200 bg-amber-50 text-amber-800`;
    default:
      return `${baseClass} border-slate-200 bg-slate-100 text-slate-700`;
  }
}

export function SkillBadge({ name, category = null }: SkillBadgeProps) {
  return <span className={getSkillBadgeClass(category)}>{name}</span>;
}

export { getSkillBadgeClass };
