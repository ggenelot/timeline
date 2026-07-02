'use client';

import { useEffect } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './icon';

export function Modal({
  onClose,
  title,
  accentColor,
  maxWidth = 520,
  className,
  children,
  footer
}: {
  onClose: () => void;
  title?: React.ReactNode;
  accentColor?: string;
  maxWidth?: number;
  className?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-[rgba(12,19,38,.55)] p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn('w-full overflow-hidden rounded-2xl bg-surface-card shadow-lift', className)}
        style={{ maxWidth }}
      >
        {accentColor ? <div className="h-1" style={{ background: accentColor }} /> : null}
        {title ? (
          <div className="flex items-start justify-between gap-3 px-5 py-4">
            <div className="text-[17px] font-bold text-ink">{title}</div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="rounded-lg p-1 text-ink-3 transition-colors hover:bg-[#F4F6FB]"
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        ) : null}
        <div className="max-h-[70vh] overflow-y-auto px-5 pb-5">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
