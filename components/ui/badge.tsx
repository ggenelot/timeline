import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'bad' | 'brand' | 'accent' | 'acsso';

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'border-line bg-surface-sub text-ink-2',
  ok: 'border-ok-line bg-ok-soft text-ok-text',
  warn: 'border-warn-line bg-warn-soft text-warn-text',
  bad: 'border-bad/30 bg-bad-soft text-bad',
  brand: 'border-[#CFDDF6] bg-[#E7EEFB] text-[#1E3C87]',
  accent: 'border-accent-ring bg-accent-soft text-accent-text',
  acsso: 'border-[#E9C9E4] bg-acsso-soft text-acsso-text'
};

export function Badge({
  tone = 'neutral',
  className,
  children
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', TONE_CLASS[tone], className)}>
      {children}
    </span>
  );
}
