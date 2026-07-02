import { cn } from '@/lib/cn';

// Teintes de chips de compétence alignées sur la refonte (README §chips) :
// PSE2 → navy · PSE1 → teal · neutre → gris · formateur → violet · matériel → orange.
const COLOR_CLASSES: Record<string, string> = {
  slate: 'border-[#E5E9F0] bg-[#F4F6FA] text-ink-2',
  sky: 'border-[#CFDDF6] bg-[#EEF4FE] text-[#1E3C87]',
  blue: 'border-[#CFDDF6] bg-[#EEF4FE] text-[#1E3C87]',
  indigo: 'border-[#CFDDF6] bg-[#EEF4FE] text-[#1E3C87]',
  cyan: 'border-[#C7E9E3] bg-[#E9F7F4] text-[#0B6E63]',
  teal: 'border-[#C7E9E3] bg-[#E9F7F4] text-[#0B6E63]',
  emerald: 'border-[#C7E9E3] bg-[#E9F7F4] text-[#0B6E63]',
  violet: 'border-[#E3D6EF] bg-[#F5EDFA] text-[#7A2E86]',
  pink: 'border-[#E9C9E4] bg-acsso-soft text-acsso-text',
  rose: 'border-bad/30 bg-bad-soft text-bad',
  amber: 'border-[#FBD9BE] bg-[#FFF3E9] text-accent-text',
  orange: 'border-[#FBD9BE] bg-[#FFF3E9] text-accent-text',
};

export function getSkillColorClass(color: string | null | undefined): string {
  return COLOR_CLASSES[color ?? ''] ?? COLOR_CLASSES.slate;
}

// Nuance représentative de chaque teinte de chip, pour les pastilles rondes
// (dot) affichées à côté d'un nom de compétence (ex. groupes d'équipage).
const DOT_HEX_CLASSES: Record<string, string> = {
  slate: '#94A3B8',
  sky: '#1E3C87',
  blue: '#1E3C87',
  indigo: '#1E3C87',
  cyan: '#0B6E63',
  teal: '#0B6E63',
  emerald: '#0B6E63',
  violet: '#7A2E86',
  pink: '#AB0093',
  rose: '#D14343',
  amber: '#B4590F',
  orange: '#B4590F',
};

export function getSkillDotColor(color: string | null | undefined): string {
  return DOT_HEX_CLASSES[color ?? ''] ?? DOT_HEX_CLASSES.slate;
}

export function SkillBadge({ name, color }: { name: string; color?: string | null }) {
  return (
    <span className={cn('inline-flex rounded-[7px] border px-2 py-0.5 text-xs font-medium', getSkillColorClass(color))}>
      {name}
    </span>
  );
}
