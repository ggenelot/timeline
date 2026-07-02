'use client';

import { cn } from '@/lib/cn';

export function Toggle({
  value,
  onChange,
  disabled,
  label
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={cn(
        'relative h-[23px] w-10 shrink-0 rounded-full transition-colors disabled:opacity-50',
        value ? 'bg-engage' : 'bg-line-field'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 block h-[19px] w-[19px] rounded-full bg-white shadow transition-all',
          value ? 'left-[19px]' : 'left-0.5'
        )}
      />
    </button>
  );
}
