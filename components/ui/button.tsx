import { cn } from '@/lib/cn';
import { Icon } from './icon';

export type ButtonVariant = 'primary' | 'engage' | 'ghost' | 'danger' | 'subtle';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white shadow-[0_8px_18px_-6px_var(--color-brand-shadow)] hover:bg-brand-for',
  engage: 'bg-engage text-white shadow-[0_4px_10px_-2px_rgba(21,147,93,.4)] hover:bg-engage-hover',
  ghost: 'border-[1.5px] border-line-field bg-surface-card text-ink-2 hover:bg-[#F4F6FB]',
  danger: 'bg-bad text-white hover:bg-[#BC3A3A]',
  subtle: 'bg-surface-sub text-ink-2 hover:bg-line'
};

export function Button({
  variant = 'primary',
  icon,
  iconRight,
  className,
  children,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: string;
  iconRight?: string;
}) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-[11px] px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASS[variant],
        className
      )}
      {...props}
    >
      {icon ? <Icon name={icon} size={18} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={18} /> : null}
    </button>
  );
}
