import { cn } from '@/lib/cn';

export function Card({
  as,
  hover = false,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: React.ElementType; hover?: boolean }) {
  const Tag = (as ?? 'div') as React.ElementType;
  return (
    <Tag
      className={cn(
        'rounded-2xl border border-line bg-surface-card shadow-card',
        hover && 'transition duration-150 hover:-translate-y-px hover:shadow-lift',
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[26px] font-black leading-tight tracking-[-0.02em] text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-2">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
