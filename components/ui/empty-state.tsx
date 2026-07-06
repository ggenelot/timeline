import { cn } from '@/lib/cn';
import { Icon } from './icon';

type Tone = 'accent' | 'brand' | 'ok' | 'acsso';

/**
 * Halo radial + couleur d'icône par tonalité (maquette 5d).
 * Les tons `accent`/`brand` passent par les variables de branding
 * personnalisables ; `ok`/`acsso` sont fixes (sémantique).
 */
const TONE: Record<Tone, { halo: string; icon: string }> = {
  accent: { halo: 'var(--color-accent-soft, #FFF1E7)', icon: 'text-accent' },
  brand: { halo: 'rgb(var(--color-brand-rgb, 0 45 116) / 0.12)', icon: 'text-brand' },
  ok: { halo: '#E9F7EF', icon: 'text-ok-text' },
  acsso: { halo: '#F8E6F4', icon: 'text-acsso' }
};

/** Gabarit d'état vide « pleine zone » : halo, icône Material, titre, texte, action. */
export function EmptyState({
  icon,
  title,
  text,
  action,
  tone = 'accent',
  className
}: {
  icon: string;
  title: string;
  text?: string;
  action?: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <span
        className="flex h-24 w-24 items-center justify-center rounded-full"
        style={{ background: `radial-gradient(circle, ${t.halo} 0%, transparent 72%)` }}
      >
        <Icon name={icon} size={44} className={t.icon} />
      </span>
      <h3 className="mt-3 text-[16.5px] font-extrabold text-ink">{title}</h3>
      {text ? <p className="mt-1 max-w-[320px] text-[13px] text-ink-2">{text}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
