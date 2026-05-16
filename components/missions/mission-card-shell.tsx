import { ReactNode } from 'react';

type MissionCardShellProps = {
  statusRail?: ReactNode;
  headerLeft: ReactNode;
  headerRight?: ReactNode;
  title: ReactNode;
  metadata?: ReactNode;
  location?: ReactNode;
  description?: ReactNode;
  requirements?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  compact?: boolean;
};

export function MissionCardShell({
  statusRail,
  headerLeft,
  headerRight,
  title,
  metadata,
  location,
  description,
  requirements,
  actions,
  footer,
  className,
  compact = false
}: MissionCardShellProps) {
  return (
    <article className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className ?? ''}`.trim()}>
      {statusRail ? <div className="absolute inset-y-0 left-0 z-10 w-12">{statusRail}</div> : null}
      <div className={compact ? 'p-4' : 'p-5'}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium">{headerLeft}</div>
          {headerRight ? <div className="flex shrink-0 items-center gap-2">{headerRight}</div> : null}
        </div>

        <div className={compact ? 'mt-1.5 flex flex-wrap items-center gap-2' : 'mt-2 flex flex-wrap items-center gap-2'}>
          <h2 className={compact ? 'text-base font-semibold text-slate-900 sm:text-lg' : 'text-xl font-semibold text-slate-900 sm:text-2xl'}>{title}</h2>
        </div>

        {metadata ? <div className={compact ? 'mt-1.5 text-sm text-slate-500' : 'mt-2 text-sm text-slate-500'}>{metadata}</div> : null}
        {location ? <div className="mt-1 text-sm text-slate-500">{location}</div> : null}
        {description ? <div className={compact ? 'mt-1.5 text-sm text-slate-700' : 'mt-2 text-sm text-slate-700'}>{description}</div> : null}
        {requirements ? <div className={compact ? 'mt-2' : 'mt-3'}>{requirements}</div> : null}

        {actions ? <div className={compact ? 'mt-3 space-y-2' : 'mt-4 space-y-3'}>{actions}</div> : null}
      </div>
      {footer ? <div className={compact ? 'border-t border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600' : 'border-t border-slate-200 bg-slate-50/80 px-5 py-4 text-sm text-slate-600'}>{footer}</div> : null}
    </article>
  );
}
