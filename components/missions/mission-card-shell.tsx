import { ReactNode } from 'react';

type MissionCardShellProps = {
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
};

export function MissionCardShell({
  headerLeft,
  headerRight,
  title,
  metadata,
  location,
  description,
  requirements,
  actions,
  footer,
  className
}: MissionCardShellProps) {
  return (
    <article className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className ?? ''}`.trim()}>
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium">{headerLeft}</div>
          {headerRight ? <div className="flex shrink-0 items-center gap-2">{headerRight}</div> : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h2>
        </div>

        {metadata ? <div className="mt-2 text-sm text-slate-500">{metadata}</div> : null}
        {location ? <div className="mt-1 text-sm text-slate-500">{location}</div> : null}
        {description ? <div className="mt-2 text-sm text-slate-700">{description}</div> : null}
        {requirements ? <div className="mt-3">{requirements}</div> : null}

        {actions ? <div className="mt-4 space-y-3">{actions}</div> : null}
        {footer ? <div className="mt-4 text-sm text-slate-600">{footer}</div> : null}
      </div>
    </article>
  );
}
